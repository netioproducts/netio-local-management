// NeutralinoExtension
//
// A Node extension engine for Neutralino.
//
// (c)2023-2024 Harald Schneider - marketmix.com

const { createLogger } = require('../logging/Logger');

const log = createLogger('NeutralinoExtension');

class NeutralinoExtension {
     constructor() {

        this.version = '1.0.4';

        if(process.argv.length > 2) {
            this.port = process.argv[2].split('=')[1];
            this.token = process.argv[3].split('=')[1];
            this.connectToken = '';
            this.idExtension = process.argv[4].split('=')[1];
            this.urlSocket = `ws://127.0.0.1:${this.port}?extensionId=${this.idExtension}`;
        }
        else {
            let fs = require('fs');
            let d = fs.readFileSync(0, 'utf-8');    // Read from stdin
            let conf = JSON.parse(d);

            this.port = conf.nlPort;
            this.token = conf.nlToken;
            this.connectToken = conf.nlConnectToken;
            this.idExtension = conf.nlExtensionId;
            this.urlSocket = `ws://127.0.0.1:${this.port}?extensionId=${this.idExtension}&connectToken=${this.connectToken}`;
        }

        this.socket = undefined;

        this.termOnWindowClose = true;   // Terminate on windowCloseEvent message

        log.debug(`${this.idExtension} running on port ${this.port}`);
    }

    sendMessage(event, data=null) {
        //
        // Add a data package to the sending queue.
        // Triggers an event in the parent app.
        // :param event: Event name as string
        // :param data: Event data
        // :return: --

        let d = {
            "id": crypto.randomUUID(),
            "method": 'app.broadcast',
            "accessToken": this.token,
            "data": {
                "event": event,
                "data": data
            }
        }
        if (!this.socket || this.socket.readyState !== 1) {
            log.warn(`Cannot send '${event}', socket to Neutralino is not open.`);
            return;
        }
        this.socket.send(JSON.stringify(d));
        log.debug('OUT', d);
    }

    run(onReceiveMessage) {
        //
        //  Socket-handler main loop. Sends and receives messages.
        //  :param onReceiveMessage: Callback for incoming messages

        const WebSocket = require('ws');
        this.socket = new WebSocket(this.urlSocket);
        let self = this;

        this.socket.on('open', () => {
            log.info(`Connected to Neutralino on port ${self.port}.`);
        });

        this.socket.on('message', (data) => {
            let msg = data.toString('utf-8');

            try {
                msg = JSON.parse(msg);
            }
            catch (e) {
                log.warn('Received a message which is not valid JSON.');
            }

            try {
                if(self.termOnWindowClose) {
                    if(msg.event === 'windowClose' || msg.event === 'appClose') {
                        log.info(`Received ${msg.event}, exiting.`);
                        try {
                            process.exit(0);
                        }
                        catch (e) {}
                        return;
                    }
                }
            }
            catch (e) {}

            log.debug('IN', msg);
            onReceiveMessage(msg);
        });

        this.socket.on('close', (code, reason) => {
            log.warn(`Connection to Neutralino closed: ${code} ${reason}`);
        });

        this.socket.on('error', (error) => {
            // ws may pass an error event instead of an Error
            log.error(`Connection to Neutralino failed: ${(error && error.message) || error}`);
        });
    }
    isEvent(e, eventName) {
        //
        // Checks data package for a particular event.

        if('event' in e && e.event === eventName) {
            return true;
        }
        return false;
    }
}

module.exports = NeutralinoExtension;
