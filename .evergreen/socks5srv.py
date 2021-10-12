#!/usr/bin/env python3
import socketserver
import socket
import select
import re
import argparse

# Usage: python3 socks5srv.py --port port [--auth username:password] [--map 'host:port to host:port' ...]
# TODO: Move this script into the shared drivers-evergreen-tools repository

class AddressRemapper:
  """A helper for remapping (host, port) tuples to new (host, port) tuples

  This is useful for Socks5 servers used in testing environments,
  because the successful use of the Socks5 proxy can be demonstrated
  by being able to 'connect' to a redirected port, which would always
  fail without the proxy, even on localhost-only environments
  """

  def __init__(self, mappings):
    self.mappings = [AddressRemapper.parse_single_mapping(string) for string in mappings]
    self.add_dns_remappings()

  @staticmethod
  def parse_single_mapping(string):
    """Parse a single mapping of the for '{host}:{port} to {host}:{port}'"""

    # Accept either [ipv6]:port or host:port
    host_re = r"(\[(?P<{0}_ipv6>[^[\]]+)\]|(?P<{0}_host>[^\[]+))"
    port_re = r"(?P<{0}_port>\d+)"

    src_re = host_re.format('src') + ':' + port_re.format('src')
    dst_re = host_re.format('dst') + ':' + port_re.format('dst')
    full_re = '^' + src_re + ' to ' + dst_re + '$'

    match = re.match(full_re, string)
    if match is None:
      raise Exception("Mapping {} does not match format '{{host}}:{{port}} to {{host}}:{{port}}'".format(string))

    src = ((match.group('src_ipv6') or match.group('src_host')).encode('utf8'), int(match.group('src_port')))
    dst = ((match.group('dst_ipv6') or match.group('dst_host')).encode('utf8'), int(match.group('dst_port')))
    return (src, dst)

  def add_dns_remappings(self):
    """Add mappings for the IP addresses corresponding to hostnames

    For example, if there is a mapping (localhost, 1000) to (localhost, 2000),
    then this also adds (127.0.0.1, 1000) to (localhost, 2000)."""

    for src, dst in self.mappings:
      host, port = src
      try:
        addrs = socket.getaddrinfo(host, port, socket.AF_UNSPEC, socket.SOCK_STREAM)
      except socket.gaierror:
        continue

      existing_src_entries = [src for src, dst in self.mappings]
      for af, socktype, proto, canonname, sa in addrs:
        if af == socket.AF_INET and sa not in existing_src_entries:
          self.mappings.append((sa, dst))
        elif af == socket.AF_INET6 and sa[:2] not in existing_src_entries:
          self.mappings.append((sa[:2], dst))

  def remap(self, hostport):
    """Re-map a (host, port) tuple to a new (host, port) tuple if that was requested"""

    for src, dst in self.mappings:
      if hostport == src:
        return dst
    return hostport

class Socks5Server(socketserver.ThreadingTCPServer):
  """A simple Socks5 proxy server"""

  def __init__(self, server_address, RequestHandlerClass, args):
    socketserver.ThreadingTCPServer.__init__(self,
                                             server_address,
                                             RequestHandlerClass)
    self.args = args
    self.address_remapper = AddressRemapper(args.map)

class Socks5Handler(socketserver.BaseRequestHandler):
  """Request handler for Socks5 connections"""

  def finish(self):
    """Called after handle(), always just closes the connection"""

    self.request.close()

  def read_exact(self, n):
    """Read n bytes from a socket

    In Socks5, strings are prefixed with a single byte containing
    their length. This method reads a bytes string containing n bytes
    (where n can be a number or a bytes object containing that
    single byte).

    If reading from the client ends prematurely, this returns None.
    """

    if type(n) is bytes:
      if len(n) == 0:
        return None
      assert len(n) == 1
      n = n[0]
    result = b''
    while len(result) < n:
      buf = self.request.recv(n - len(result))
      if buf == b'':
        return None
      result += buf
    return result

  def create_outgoing_tcp_connection(self, dst, port):
    """Create an outgoing TCP connection to dst:port"""

    outgoing = None
    for res in socket.getaddrinfo(dst, port, socket.AF_UNSPEC, socket.SOCK_STREAM):
      af, socktype, proto, canonname, sa = res
      try:
        outgoing = socket.socket(af, socktype, proto)
      except OSError as msg:
        continue
      try:
        outgoing.connect(sa)
      except OSError as msg:
        outgoing.close()
        continue
      break
    return outgoing

  def handle(self):
    """Handle the Socks5 communication with a freshly connected client"""

    # Client greeting
    if self.request.recv(1) != b'\x05': # Socks5 only
      return
    n_auth = self.request.recv(1)
    client_auth_methods = self.read_exact(n_auth)
    if client_auth_methods is None:
      return

    # choose either no-auth or username/password
    required_auth_method = b'\x00' if self.server.args.auth is None else b'\x02'
    if required_auth_method not in client_auth_methods:
      self.request.sendall(b'\x05\xff')
      return

    self.request.sendall(b'\x05' + required_auth_method)
    if required_auth_method == b'\x02':
      auth_version = self.request.recv(1)
      if auth_version != b'\x01': # Only username/password auth v1
        return
      username_len = self.request.recv(1)
      username = self.read_exact(username_len)
      password_len = self.request.recv(1)
      password = self.read_exact(password_len)
      if username is None or password is None:
        return
      if username.decode('utf8') + ':' + password.decode('utf8') != self.server.args.auth:
        return
      self.request.sendall(b'\x01\x00') # auth success

    if self.request.recv(1) != b'\x05': # Socks5 only
      return
    if self.request.recv(1) != b'\x01': # Outgoing TCP only
      return
    if self.request.recv(1) != b'\x00': # Reserved, must be 0
      return

    addrtype = self.request.recv(1)
    dst = None
    if addrtype == b'\x01': # IPv4
      ipv4raw = self.read_exact(4)
      if ipv4raw is not None:
        dst = '.'.join(['{}'] * 4).format(*ipv4raw)
    elif addrtype == b'\x03': # Domain
      domain_len = self.request.recv(1)
      dst = self.read_exact(domain_len)
    elif addrtype == b'\x04': # IPv6
      ipv6raw = self.read_exact(16)
      if ipv6raw is not None:
        dst = ':'.join(['{:0>2x}{:0>2x}'] * 8).format(*ipv6raw)
    else:
      return

    if dst is None:
      return

    portraw = self.read_exact(2)
    port = portraw[0] * 256 + portraw[1]

    (dst, port) = self.server.address_remapper.remap((dst, port))

    outgoing = self.create_outgoing_tcp_connection(dst, port)
    if outgoing is None:
      self.request.sendall(b'\x05\x01\x00') # just report a general failure
      return
    # success response, do not bother actually stating the locally bound
    # host/port address and instead always say 127.0.0.1:4096.
    # for our use case, the client will not be making meaningful use
    # of this anyway
    self.request.sendall(b'\x05\x00\x00\x01\x7f\x00\x00\x01\x10\x00')

    self.raw_proxy(self.request, outgoing)

  def raw_proxy(self, a, b):
    """Proxy data between sockets a and b as-is"""

    with a, b:
      while True:
        try:
          (readable, _, _) = select.select([a, b], [], [])
        except (select.error, ValueError):
          return

        if not readable:
          continue
        for sock in readable:
          buf = sock.recv(4096)
          if buf == b'':
            return
          if sock is a:
            b.sendall(buf)
          else:
            a.sendall(buf)

if __name__ == '__main__':
  parser = argparse.ArgumentParser(description='Start a Socks5 proxy server.')
  parser.add_argument('--port', type=int, required=True)
  parser.add_argument('--auth', type=str)
  parser.add_argument('--map', type=str, action='append', default=[])
  args = parser.parse_args()

  socketserver.TCPServer.allow_reuse_address = True
  with Socks5Server(('localhost', args.port), Socks5Handler, args) as server:
    server.serve_forever()
