import { on } from 'events';
import { PathLike } from 'fs';
import { access, readFile } from 'fs/promises';
import { createServer } from 'http';
import { join } from 'path';

const fromDir = (...filePath) => join('docs', ...filePath);
const server = createServer();
server.listen(8080, 'localhost', 128, () => console.log('Listening on http://localhost:8080'));
const canAccess = async (pathlike: PathLike) => await access(pathlike).then(() => true,() => false);

async function main() {
  for await (const [request, response] of on(server, 'request')) {
    const url = new URL(request.url, `http://${request.headers.host}`);
    console.log(request.method, url.pathname);
    const pathname = url.pathname.replace('/node-mongodb-native', '');
    console.log(pathname)
    try {
      if (pathname === '/') {
        response.end(await readFile(fromDir('index.html')));
        continue;
      } else {
        const filePath = fromDir(pathname.slice(1));
        if (await canAccess(filePath)) {
          response.end(await readFile(filePath))
        } else {
          response.end(await readFile(fromDir('404.html')))
        };
      }
    } catch (error) {
      response.statusCode = 500;
      response.end(`Bad Request: ${error}`, 'utf8');
    }
  }
}
main().then(() => console.log('end')).catch(e => console.log(e)).finally(() => server.close());
