import { init, arrowText, checkmarkText } from './init.js';
import { exec } from 'child_process';

const CDK_DEPLOY = 'cdk deploy';

const deploy = () => {
  init();

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

export default deploy;