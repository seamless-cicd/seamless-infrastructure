const { arrowText, checkmarkText } = require('../utils.js');

const API_GATEWAY_TEXT = 'API Gateway URL: ';

const deploy = async () => {
  const { execa } = await require('../esmodules.js')();
  arrowText('Deploying Seamless:', 'with AWS CDK');

  const childProcess = execa('sh', ['cli/test.sh']).pipeStdout(process.stdout);
  let apiGatewayUrl;

  childProcess.stdout.on('data', (data) => {
    const string = data.toString().trim();
    if (string.match(API_GATEWAY_TEXT)) {
      const urlStart = string.indexOf(':') + 2;
      apiGatewayUrl = string.slice(urlStart);
    }
  });

  arrowText('Seamless Deploy:', 'with AWS CDK');
  await childProcess;
  checkmarkText('Seamless Deploy:', 'complete');
  arrowText("Here's the link to your Seamless Dashboard:", apiGatewayUrl);
};

module.exports = { deploy };
