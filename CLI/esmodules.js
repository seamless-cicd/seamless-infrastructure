const esModuleMigration = async () => {
  const chalk = (await import('chalk')).default;
  const { execa } = await import('execa');
  return {
    chalk,
    execa,
  };
};

module.exports = esModuleMigration;
