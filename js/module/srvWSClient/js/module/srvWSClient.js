const CONNECTION_TIMEOUT = 5000;
const EVENT_INIT = 'init';
const EVENT_CONNECT = 'connect';
const SERVICE_NAME = 'WSClient';

//const { WebSocket, WebSocketServer } = require('ws');

class WebSocketClient {
    constructor(sysBus, logBus) {
    //реализация паттерна синглтон
        if (this.Instance) {
            return this.Instance;
        } else {
            WebSocketClient.prototype.Instance = this;
        }
        this._SourcesState;
        this._sysBus = sysBus;
        this._logBus = logBus;
        this._Sockets = [];
        this._lastId = 0;
        this.Init();
    }
    Init() {
        this._sysBus.on(EVENT_INIT, (_SourcesState, _ServicesState) => {
            this._SourcesState = _SourcesState;
            _ServicesState.SetServiceObject(SERVICE_NAME, this);
        });
        this._sysBus.on(EVENT_CONNECT, () => {
            this.Start();
        });
        this._sysBus.on('pwsc-msg-return', (msg, sourceName) => {
            let index = this._SourcesState._collection.findIndex((element) => element.ExpectName == sourceName);

            if (index != -1) {
                let key = this._SourcesState.GetConnectionKey(index);
                let socket = this._Sockets.find(s => s.ID == key);
                socket.send(msg);
                this._logBus.emit('logInfo', "Message sent to " + sourceName);
            }
            else {
                this._logBus.emit('logWarn', "Cannot find source " + sourceName);
            }
        });
        this._sysBus.on('close-all', () => {
            this._Sockets.forEach(socket => {
                socket.close();
            });
            this._logBus.emit('logInfo', "All sockets are closed");
        });
        this._logBus.emit('logInfo', "WSClient initialized!");
    }
    /**
     * @method
     * @description Инициализирует соединение с источниками по вебсокетам
     */
    Start() {
        let tOut = setTimeout(() => {
            this.ConnectionDone();
        }, CONNECTION_TIMEOUT);
        this._SourcesState._collection.forEach(connection => {
            if (connection.IsConnected == false) {
                let name = "";
                if (connection.DNS != '') {name = connection.DNS}
                else {name = connection.IP};
                let url = 'ws://' + name + ':' + connection.Port;
                let socket = new WebSocket(url);
                socket.ID = this._lastId;
                connection.CheckClient = true;
                this._lastId++;

                socket.addEventListener("open", (event) => {
                    connection.IsConnected = true;
                    connection.IndSrc = socket.ID;
                    this._logBus.emit('logInfo', "Connected to " + socket.url);
                });

                socket.addEventListener("close", (event) => {
                    if (event.wasClean) {
                        this._logBus.emit('logInfo', "Disconnected.");
                    } else {
                        //this._logBus.emit('logWarn', "Unexpected disconnect.");
                    }
                    //this._logBus.emit('logWarn', "Closed upon " + this._Sockets[i].url + "(Code: " + event.code + ", reason: " + event.reason + ")");
                    connection.IsConnected = false;
                    connection.IndSrc = -1;
                });

                socket.addEventListener("message", (event) => {
                    let sourceName = this._SourcesState.GetNameByKey(connection.IndSrc);
                    this._sysBus.emit("wsc-msg-return", event.data, sourceName)
                    this._logBus.emit('logInfo', "Got data from " + sourceName);
                    this._logBus.emit('logInfo', "Data: " + event.data);
                });

                socket.addEventListener("error", (error) => {
                    this._failedConnections++;
                    this._logBus.emit('logWarn', "Closed upon " + socket.url + "(Reason: " + error.message + ")");
                });

            this._Sockets.push(socket);
            }            
        });
    }
    /**
     * @method
     * Генерация события для процесса об окончании установления подключений
     */
    ConnectionDone() {
        this._sysBus.emit('ws-addr-done');
    }
}

module.exports = WebSocketClient;