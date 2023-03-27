const { arrowText, checkmarkText } = require('../utils.js');

const teardown = async () => {
  const { execa } = await require('../esmodules.js')();
  arrowText('Tearing down Seamless Infrastructure:', 'with AWS CDK');

  const { stdout } = await execa('cdk', ['destroy']).pipeStdout(process.stdout);

  arrowText('Seamless Teardown:', 'with AWS CDK');
  checkmarkText('Seamless Teardown:', 'complete');
};

module.exports = { teardown };
