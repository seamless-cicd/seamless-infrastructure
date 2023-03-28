const {
  ApiGatewayV2Client,
  GetApisCommand,
} = require('@aws-sdk/client-apigatewayv2');

const chalk = require('chalk');

const rightArrowText = (text1, text2, text3 = '') => {
  const arrow = '\u2192';
  console.log(chalk.bold.blue(`${arrow} ${text1}`), `${text2}`, `${text3}`);
};

const downArrowText = (text1, text2, text3 = '') => {
  const arrow = '\u2193';
  console.log(chalk.bold.blue(`${arrow} ${text1}`), `${text2}`, `${text3}`);
};

const checkmarkText = (text1, text2) => {
  console.log(
    chalk.bold(`${chalk.green('✔️')}`),
    chalk.bold.blue(text1),
    text2,
  );
};

const logo = chalk.blue(`
                  (((((((((      
          (((((((((((((((((      
      (((((((                   
    (((((     ((((((((((((((    
 (((((    (((((((((((((((((((( 
 ((((  (((((               ((((
(((((  ((((          ((((  (((((
 ((((               (((((  ((((
  ((((((((((((((((((((    (((((
     ((((((((((((((     (((((  
                    (((((((   
      (((((((((((((((((
      (((((((((    
`);

const getApiGatewayUrl = async () => {
  const apiGatewayClient = new ApiGatewayV2Client({
    region: AWS_REGION,
  });

  try {
    const apis = await apiGatewayClient.send(new GetApisCommand({}));
    if (!apis.Items || apis.Items.length === 0)
      throw new Error('no api gateways found');

    const httpApis = apis.Items.filter((api) => {
      if (!api.Tags) return false;
      return api.Tags['aws:cloudformation:logical-id'] === 'SeamlessHttpApi';
    });
    if (httpApis.length === 0) throw new Error('no api gateways found');

    let url = httpApis[0].ApiEndpoint;

    return url;
  } catch (error) {
    console.error(error);
    return '';
  }
};

module.exports = {
  rightArrowText,
  downArrowText,
  checkmarkText,
  getApiGatewayUrl,
  logo,
};
