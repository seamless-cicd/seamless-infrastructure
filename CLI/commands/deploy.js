const {
  rightArrowText,
  checkmarkText,
  getApiGatewayUrl,
} = require('../utils.js');

const deploy = async () => {
  const { execa } = await require('../esmodules.js')();
  rightArrowText('Deploying Seamless:', 'with AWS CDK');

  const childProcess = execa('cdk', ['deploy']);

  await childProcess.pipeStdout(process.stdout);
  checkmarkText('Seamless Deploy:', 'complete');

  // Get API url once deploy completes
  const apiGatewayUrl = await getApiGatewayUrl();

  rightArrowText("Here's the link to your Seamless Dashboard:", apiGatewayUrl);
};

module.exports = { deploy };
