import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

import { init, app, events } from "@neutralinojs/lib"
import { broadcastRaw, initTransport } from './services/neutralinoTransport';

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