import { spawn } from 'child_process';

const child = spawn('C:\\\\ct\\\\debug\\\\adeorq.exe', ['--mcp']);

child.stdout.on('data', (data) => {
  console.log('--- RECEIVED FROM SERVER ---');
  console.log(data.toString().trim());
});

child.stderr.on('data', (data) => {
  console.error('--- SERVER STDERR ---');
  console.error(data.toString().trim());
});

child.on('close', (code) => {
  console.log(`Process exited with code ${code}`);
});

// Step 1: Initialize
const initReq = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "test", version: "1.0" }
  }
};

console.log('Sending initialize...');
child.stdin.write(JSON.stringify(initReq) + '\n');

// Step 2: List tools (wait 1.5 seconds)
setTimeout(() => {
  const toolsReq = {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {}
  };
  console.log('Sending tools/list...');
  child.stdin.write(JSON.stringify(toolsReq) + '\n');
}, 1500);

// Exit after 3.5 seconds
setTimeout(() => {
  console.log('Exiting...');
  child.stdin.end();
  child.kill();
}, 3500);
