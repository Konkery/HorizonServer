module.exports = (dependenies) => {
    const { WebSocket } = dependenies;

    class WebSocketClient {
          constructor() {
          //реализация паттерна синглтон
          if (this.Instance) {
              return this.Instance;
          } else {
              WebSocketClient.prototype.Instance = this;
          }
          this._SystemBus;
          this._LoggerBus;
          this._SourcesInfo;
          this._Sockets = [];
          this._connectionsToCheck;
          this._successConnections;
          this._failedConnections;
      }
      Init(_SystemBus, _LoggerBus) {
        this._SystemBus = _SystemBus;
        this._LoggerBus = _LoggerBus;
        this._SystemBus.on('ws-addr-cast', (_SourcesInfo) => {
            this._SourcesInfo = _SourcesInfo;
            this.Start();
        });
        this._SystemBus.on('pwsc-msg-return', (msg, sourceName) => {
            let index = this._SourcesInfo._collection.findIndex((element) => element._sourceName == sourceName);

            if (index != -1) {
                let key = this._SourcesInfo.GetConnectionKey(index);
                this._Sockets[key].send(msg);
                this._LoggerBus.emit('logInfo', "Message sent to " + this._Sockets[key].url);
            }
            else {
                this._LoggerBus.emit('logWarn', "Cannot find source " + sourceName);
            }
        });
        this._SystemBus.on('close-all', () => {
            for (let i = 0; i < this._Sockets.length; i++)
            {
                this._Sockets[i].close();
            }
            this._LoggerBus.emit('logInfo', "All sockets are closed");
        });
        this._LoggerBus.emit('logInfo', "WSClient initialized!");
      }
      /**
       * @method
       * @description Инициализирует соединение с источниками по вебсокетам
       */
      Start() {
          let sInfo = this._SourcesInfo._collection;
          this._connectionsToCheck = 0;
          this._successConnections = 0;
          this._failedConnections = 0;
          // Посчитать - сколько нужно проверить соединений
          for (let i = 0; i < sInfo.length; i++) {
              let info = sInfo[i];
              if (info._isConnected) continue;// Коннект уже присутствует - пропускаем
              let name;
              if (info._domainName != '') {// Нет доменного имени - используем IP
                  name = info._domainName;
              }
              else if (info._ipAddress != '') {// Нет IP - пропускаем
                  name = info._ipAddress;
              }
              else continue;
              this._connectionsToCheck++;// Считаем сколько по итогу возможных соединений
          };
          // Создать сокеты для каждого коннекта и ждать
          for (let i = 0; i < sInfo.length; i++) {
              let info = sInfo[i];
              if (info._isConnected) continue;// Коннект уже присутствует - пропускаем
              let name;
              if (info._domainName != '') {// Нет доменного имени - используем IP
                  name = info._domainName;
              }
              else if (info._ipAddress != '') {// Нет IP - пропускаем
                  name = info._ipAddress;
              }
              else continue;
              let url = 'ws://' + name + ':' + info._port;
              this._Sockets[i] = new WebSocket(url);              

              this._Sockets[i].addEventListener("open", (event) => {
                  this._successConnections++;
                  this._SourcesInfo.SetConnectionFlagTrue(i);
                  this._SourcesInfo.SetConnectionKey(i, i);
                  this._LoggerBus.emit('logInfo', "Connected to " + this._Sockets[i].url);
                  this.ConnectionDone();
              });

              this._Sockets[i].addEventListener("close", (event) => {
                  if (event.wasClean) {
                    this._LoggerBus.emit('logInfo', "Disconnected.");
                  } else {
                    //this._LoggerBus.emit('logWarn', "Unexpected disconnect.");
                  }
                  //this._LoggerBus.emit('logWarn', "Closed upon " + this._Sockets[i].url + "(Code: " + event.code + ", reason: " + event.reason + ")");
                  this._SourcesInfo.SetConnectionFlagFalse(i);
              });
              
              this._Sockets[i].addEventListener("message", (event) => {
                  let sourceName = this._SourcesInfo.GetNameByKey(i);
                  this._SystemBus.emit("wsc-msg-return", event.data, sourceName)
                  this._LoggerBus.emit('logInfo', "Got data from " + sourceName);
                  this._LoggerBus.emit('logInfo', "Data: " + event.data);
              });
                
              this._Sockets[i].addEventListener("error", (error) => {
                  this._failedConnections++;
                  this._LoggerBus.emit('logWarn', "Closed upon " + this._Sockets[i].url + "(Reason: " + error.message + ")");
                  this.ConnectionDone();
              });
          }
          this.ConnectionDone();
      }
      /**
       * @method
       * Генерация события для процесса об окончании установления подключений
       */
      ConnectionDone() {
          if (this._connectionsToCheck == (this._successConnections + this._failedConnections)) {
              if (this._failedConnections == this._connectionsToCheck) {// ни к кому не подключились
                  this._SystemBus.emit('ws-addr-fail');
              }
              else {
                  this._SystemBus.emit('ws-addr-done');
              }              
          }
      }
    }
    return WebSocketClient;
}