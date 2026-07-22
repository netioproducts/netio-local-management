export default class NeutralinoExtension {
  constructor(debug?: boolean);
  sendMessage(event: string, data?: any): void;
  run(onReceiveMessage: (msg: any) => void): void;
}
