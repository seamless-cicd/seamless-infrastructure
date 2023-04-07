const { rightArrowText, checkmarkText } = require('../utils.js');

const teardown = async () => {
  const { execa } = await require('../esmodules.js')();
  rightArrowText('Tearing down Seamless Infrastructure:', 'with AWS CDK');

  await execa('cdk', ['destroy']).pipeStdout(process.stdout);

  checkmarkText('Seamless Teardown:', 'complete');
};

module.exports = { teardown };
