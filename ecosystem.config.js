module.exports = {
  apps: [
    {
      name: 'ascent',
      script: './server/index.js',
      watch: false,
      restart_delay: 2000,
      env: {
        PORT: 3001,
        NODE_ENV: 'production',
        NVM_DIR: process.env.HOME + '/.nvm',
      },
    },
  ],
};
