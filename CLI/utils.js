const chalk = require('chalk');

const arrowText = (text1, text2, text3 = '') => {
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

module.exports = { arrowText, checkmarkText, logo };
