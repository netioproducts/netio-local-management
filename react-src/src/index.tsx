import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

import { init, app, events } from "@neutralinojs/lib"
import { broadcastRaw, initTransport } from './services/neutralinoTransport';
import { notifyError } from './services/notificationService';

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

// Safety net for failed requests nobody handled
window.addEventListener("unhandledrejection", (event) => {
  notifyError("Unexpected error", event.reason);
});

// console.log = () => { };
// console.debug = () => { };
// console.info = () => { };

const onWindowClose = async () => {
  try {
    console.warn("Window is closing...");
    await broadcastRaw("windowClose");
    await app.exit();
  } catch (error) {
    console.error("Error during window close handling:", error);
    app.killProcess();
  }
}

events.on("windowClose", onWindowClose);