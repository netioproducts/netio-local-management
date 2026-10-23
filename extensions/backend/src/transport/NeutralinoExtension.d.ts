export default class NeutralinoExtension {
  constructor();
  sendMessage(event: string, data?: any): void;
  run(onReceiveMessage: (msg: any) => void): void;
}
