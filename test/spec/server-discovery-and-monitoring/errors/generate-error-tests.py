import itertools
import os
import subprocess
import sys

# Require Python 3.7+ for ordered dictionaries so that the order of the
# generated tests remain the same.
if sys.version_info[:2] < (3, 7):
    print('ERROR: This script requires Python >= 3.7, not:')
    print(sys.version)
    print('Usage: python3 %s' % (sys.argv[0]))
    exit(1)


dirname = os.path.dirname
DIR = dirname(os.path.realpath(__file__))
SOURCE = dirname(dirname(dirname(DIR)))


def template(filename):
    fullpath = os.path.join(DIR, filename)
    with open(fullpath, 'r') as f:
        return f.read()


def write_test(filename, data):
    fullpath = os.path.join(DIR, filename + '.yml')
    with open(fullpath, 'w') as f:
        f.write(data)

    print(f"Generated {fullpath}")


# Maps from error_name to (error_code,)
ERR_CODES = {
    'InterruptedAtShutdown': (11600,),
    'InterruptedDueToReplStateChange': (11602,),
    'NotPrimaryOrSecondary': (13436,),
    'PrimarySteppedDown': (189,),
    'ShutdownInProgress': (91,),
    'NotWritablePrimary': (10107,),
    'NotPrimaryNoSecondaryOk': (13435,),
    'LegacyNotPrimary': (10058,),
}


def create_stale_tests():
    tmp = template('stale-topologyVersion.yml.template')
    for error_name in ERR_CODES:
        test_name = f'stale-topologyVersion-{error_name}'
        error_code, = ERR_CODES[error_name]
        data = tmp.format(**locals())
        write_test(test_name, data)

TV_GREATER = '''
      topologyVersion:
        processId:
          "$oid": '000000000000000000000001'
        counter:
          "$numberLong": "2"'''
TV_GREATER_FINAL =  '''
          processId:
            "$oid": '000000000000000000000001'
          counter:
            "$numberLong": "2"'''
TV_CHANGED = '''
      topologyVersion:
        processId:
          "$oid": '000000000000000000000002'
        counter:
          "$numberLong": "1"'''
TV_CHANGED_FINAL =  '''
          processId:
            "$oid": '000000000000000000000002'
          counter:
            "$numberLong": "1"'''

# Maps non-stale error description to:
# (error_topology_version, final_topology_version)
NON_STALE_CASES = {
    'topologyVersion missing': ('', ' null'),
    'topologyVersion greater': (TV_GREATER, TV_GREATER_FINAL),
    'topologyVersion proccessId changed': (TV_CHANGED, TV_CHANGED_FINAL),
}


def create_non_stale_tests():
    tmp = template('non-stale-topologyVersion.yml.template')
    for error_name, description in itertools.product(
            ERR_CODES, NON_STALE_CASES):
        test_name = f'non-stale-{description.replace(" ", "-")}-{error_name}'
        error_code, = ERR_CODES[error_name]
        error_topology_version, final_topology_version = NON_STALE_CASES[description]
        # On 4.2+, only ShutdownInProgress and InterruptedAtShutdown will
        # clear the pool.
        if error_name in ("ShutdownInProgress", "InterruptedAtShutdown"):
            final_pool_generation = 1
        else:
            final_pool_generation = 0

        data = tmp.format(**locals())
        write_test(test_name, data)


WHEN = ['beforeHandshakeCompletes', 'afterHandshakeCompletes']
STALE_GENERATION_COMMAND_ERROR = '''
    type: command
    response:
      ok: 0
      errmsg: {error_name}
      code: {error_code}
      topologyVersion:
        processId:
          "$oid": '000000000000000000000001'
        counter:
          "$numberLong": "2"'''
STALE_GENERATION_NETWORK_ERROR = '''
    type: {network_error_type}'''


def create_stale_generation_tests():
    tmp = template('stale-generation.yml.template')
    # Stale command errors
    for error_name, when in itertools.product(ERR_CODES, WHEN):
        test_name = f'stale-generation-{when}-{error_name}'
        error_code, = ERR_CODES[error_name]
        stale_error = STALE_GENERATION_COMMAND_ERROR.format(**locals())
        data = tmp.format(**locals())
        write_test(test_name, data)
    # Stale network errors
    for network_error_type, when in itertools.product(
            ['network', 'timeout'], WHEN):
        error_name = network_error_type
        test_name = f'stale-generation-{when}-{network_error_type}'
        stale_error = STALE_GENERATION_NETWORK_ERROR.format(**locals())
        data = tmp.format(**locals())
        write_test(test_name, data)


def create_pre_42_tests():
    tmp = template('pre-42.yml.template')
    # All "not writable primary"/"node is recovering" clear the pool on <4.2
    for error_name in ERR_CODES:
        test_name = f'pre-42-{error_name}'
        error_code, = ERR_CODES[error_name]
        data = tmp.format(**locals())
        write_test(test_name, data)


def create_post_42_tests():
    tmp = template('post-42.yml.template')
    for error_name in ERR_CODES:
        test_name = f'post-42-{error_name}'
        error_code, = ERR_CODES[error_name]
        # On 4.2+, only ShutdownInProgress and InterruptedAtShutdown will
        # clear the pool.
        if error_name in ("ShutdownInProgress", "InterruptedAtShutdown"):
            final_pool_generation = 1
        else:
            final_pool_generation = 0
        data = tmp.format(**locals())
        write_test(test_name, data)


create_stale_tests()
create_non_stale_tests()
create_stale_generation_tests()
create_pre_42_tests()
create_post_42_tests()

print('Running make')
subprocess.run(f'cd {SOURCE} && make', shell=True, check=True)
