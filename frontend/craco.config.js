// craco.config.js: ajustes sobre o Create React App.
const path = require("path");

// O package.json fixa o webpack-dev-server 5 (correções de segurança), mas o react-scripts 5
// ainda gera a configuração no formato da versão 4. Esta função converte as opções que mudaram.
function makeDevServerV5Compatible(devServerConfig) {
  const { https, onAfterSetupMiddleware, onBeforeSetupMiddleware, onListening, setupMiddlewares, ...config } =
    devServerConfig;

  config.server = typeof https === "object" ? { type: "https", options: https } : https ? "https" : "http";

  if (onBeforeSetupMiddleware || setupMiddlewares) {
    config.setupMiddlewares = (middlewares, devServer) => {
      if (onBeforeSetupMiddleware) onBeforeSetupMiddleware(devServer);
      return setupMiddlewares ? setupMiddlewares(middlewares, devServer) : middlewares;
    };
  }

  config.onListening = (devServer) => {
    devServer.close ??= (callback) => devServer.stopCallback(callback);
    if (onListening) onListening(devServer);
    if (onAfterSetupMiddleware) onAfterSetupMiddleware(devServer);
  };

  return config;
}

module.exports = {
  webpack: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  devServer: makeDevServerV5Compatible,
};
