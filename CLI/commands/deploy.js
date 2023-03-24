const { exec } = require('child_process');
const { arrowText, checkmarkText } = require('../utils.js');

const CDK_DEPLOY = 'cdk deploy';

const deploy = () => {
  exec(CDK_DEPLOY, (err, stdout, stderr) => {
    if (err) {
      console.error(err);
      console.error(`stderr: ${stderr}`);
      return;
    }

    arrowText('Seamless Deploy:', 'with AWS CDK', `${stdout}`);
    checkmarkText('Seamless Deploy:', 'complete');
  });
};

module.exports = { deploy };
