const { startStep } = require('./pipelineEngine');

const PROJECT_ID = '22222222-2222-2222-2222-222222222222';

async function main() {
  const [a, b] = await Promise.all([
    startStep(PROJECT_ID, 'STYLE'),
    startStep(PROJECT_ID, 'STYLE'),
  ]);
  console.log('Result A:', a);
  console.log('Result B:', b);
}

main();
