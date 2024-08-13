module.exports = (dependenies) => {
    const { Process, SystemBus, WebSocket, Logger } = dependenies;

    class WebSocketClient {
          constructor() {
          //реализация паттерна синглтон
          if (this.Instance) {
              return this.Instance;
          } else {
              WebSocketClient.prototype.Instance = this;
          }
          SystemBus.on('ws-addr-cast', () => {
              this.Init();
          })
          this._Sockets = [];
          this._connectionsToCheck;
          this._successConnections;
          this._failedConnections;
      }
      /**
       * @method
       * Инициализирует соединение с источниками по вебсокетам
       */
      Init() {
          let aInfo = Process._SystemInfo;
          this._connectionsToCheck = 0;
          this._successConnections = 0;
          this._failedConnections = 0;
          // Посчитать - сколько нужно проверить соединений
          for (let i = 0; i < aInfo.Connection.length; i++) {
              let info = aInfo.Connection[i];
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
          for (let i = 0; i < aInfo.Connection.length; i++) {
              let info = aInfo.Connection[i];
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
                  Process.SetConnectionFlagTrue(i);
                  Process.SetConnectionKey(i, i);
                  Logger.Log(Logger.LogLevel.INFO, "Connected to " + this._Sockets[i].url);
                  this.ConnectionDone();
              });

              this._Sockets[i].addEventListener("close", (event) => {
                  if (event.wasClean) {
                    console.log('Соединение закрыто чисто');
                  } else {
                    //console.log('Обрыв соединения');
                  }
                  Logger.Log(Logger.LogLevel.WARN, "Closed upon " + this._Sockets[i].url);
                  //console.log('Код: ' + event.code + ' причина: ' + event.reason);
              });
              
              this._Sockets[i].addEventListener("message", (event) => {
                  console.log("Получены данные " + event.data);
              });
                
              this._Sockets[i].addEventListener("error", (error) => {
                  this._failedConnections++;
                  Process.SetConnectionFlagFalse(i);
                  Logger.Log(Logger.LogLevel.WARN, "Error: " + error.message);
                  this.ConnectionDone();
                  //console.log("Ошибка " + error.message);
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
                  SystemBus.emit('ws-addr-fail');
              }
              else {
                  SystemBus.emit('ws-addr-done');
              }              
          }
      }
    }
    return WebSocketClient;
}