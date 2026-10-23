import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

import { init, app, events } from "@neutralinojs/lib"
import { broadcastRaw, initTransport } from './services/neutralinoTransport';
import { notifyError } from './services/notificationService';
import { appService } from './services/appSerivce';
import { configureLogger, createLogger } from './services/logger';

const log = createLogger("App");

import "bootstrap/dist/css/bootstrap.min.css";

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <StrictMode>
    <App />
  </StrictMode>
);

init();
initTransport();

// Console logging is enabled only when the backend runs in debug mode
appService.getLogLevel()
  .then(({ logLevel }) => {
    configureLogger(logLevel);
    log.info(`Log level: ${logLevel}`);
  })
  .catch(() => {
    // Backend is not reachable, console logging stays off and requests report the problem
  });

// Safety net for failed requests nobody handled
window.addEventListener("unhandledrejection", (event) => {
  notifyError("Unexpected error", event.reason);
});

const onWindowClose = async () => {
  try {
    log.info("Window is closing");
    await broadcastRaw("windowClose");
    await app.exit();
  } catch (error) {
    log.error("Error during window close handling", error);
    app.killProcess();
  }
}

events.on("windowClose", onWindowClose);