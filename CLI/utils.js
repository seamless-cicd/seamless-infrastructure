const { config } = require('dotenv');
config();

const {
  ApiGatewayV2Client,
  GetApisCommand,
} = require('@aws-sdk/client-apigatewayv2');

const chalk = require('chalk');

const region = process.env.REGION;

const rightArrowText = (text1, text2, text3 = '') => {
  const arrow = '\u2192';
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
    region,
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

function isValidEmail(value) {
  // This is a simple email validation regex, you can replace it with your own implementation
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidUrl(value) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  rightArrowText,
  checkmarkText,
  isValidEmail,
  isValidUrl,
  getApiGatewayUrl,
  logo,
};
