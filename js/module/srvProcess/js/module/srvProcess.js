class Connection {
    constructor(domainName, sourceName, type, ipAddress, port, MAC, hKey, chCount, isConnected, procMetaData, isSynced, flag4) {
        this._domainName = domainName;
        this._sourceName = sourceName;
        this._type = type;
        this._ipAddress = ipAddress;
        this._port = port;
        this._MAC = MAC;
        this._hKey = hKey;
        this._chCount = chCount;
        this._isConnected = isConnected;
        this._procMetaData = procMetaData;
        this._isSynced = isSynced;
        this._flag4 = flag4;//
    }
}

class Sources {
    constructor() {
        this._collection = [];
        this.Init();
    }
    Init() {
        let arr = this.GetConnections();
        let numServices = arr.length;
        
        for (let i = 0; i < numServices; i++) {
            this._collection[i] = new Connection(arr[i].domain, arr[i].source, arr[i].type, arr[i].ip, arr[i].port, "", "", "", 0, 0, 0, 0);
        }
    }
    /**
     * @method
     * Возвращает из базы данных список известных источников
     * @returns Array[Object]   arr - массив объектов с описанием источников
     */
    GetConnections() {// Заглушка
        let arr = [
            {domain: "", source: "PLC11", type: "plc", ip: "192.168.50.151", port: "8080"},
            {domain: "", source: "PLC21", type: "plc", ip: "192.168.50.156", port: "8080"},
            {domain: "", source: "PLC22", type: "plc", ip: "192.168.50.157", port: "8080"},
            {domain: "", source: "PLC31", type: "plc", ip: "192.168.50.161", port: "8080"},
            {domain: "", source: "PLC32", type: "plc", ip: "192.168.50.162", port: "8080"},
        ];
        return arr;
    }
    SetConnectionFlagTrue(_cIndex) {
        this._collection[_cIndex]._isConnected = 1;
    }
    SetConnectionFlagFalse(_cIndex) {
        this._collection[_cIndex]._isConnected = 0;
    }
    GetConnectionKey(_cIndex) {
        return this._collection[_cIndex]._hKey;
    }
    SetConnectionKey(_cIndex, _sIndex) {
        this._collection[_cIndex]._hKey = _sIndex;
    }
    GetNameByKey(_key) {
        let index = this._collection.findIndex((element) => element._hKey == _key);
        return this._collection[index]._sourceName;
    }
}

class ProcessSrv {
    #_SourcesInfo;

    constructor() {
        //реализация паттерна синглтон
        if (this.Instance) {
            return this.Instance;
        } else {
            ProcessSrv.prototype.Instance = this;
        }
        this._SystemBus;
        this._LoggerBus;
    }
    /**
     * @method
     * Инициализирует работу Process. Создаёт объект, описывающий подключения
     * и генерирует событие для клиентов на подключение к источникам
     */
    Init(_SystemBus, _LoggerBus) {
        // Нет объекта - создать
        if (typeof this.#_SourcesInfo === 'undefined') {
            this.FormSysInfo();

            this._SystemBus = _SystemBus;
            this._LoggerBus = _LoggerBus;
            this._SystemBus.on('ws-addr-fail', () => {
                this._LoggerBus.emit('logError', "Failed to connect to anyone via WebSocket!");
            });
            this._SystemBus.on('ws-addr-done', () => {
                let arr = [];
                this.#_SourcesInfo._collection.forEach((connection) => {
                    if (connection._isConnected == 1) {
                        arr.push(connection._sourceName)
                    }
                });
                this._LoggerBus.emit('logInfo', "Connected to: " + arr);
                // Генерация события для прокси на отправку запроса на имена и МАC-адреса
                /*let packet = {com: 'proc-get-systemdata', args: []};
                arr.forEach((connect) => {
                    this._SystemBus.emit('pwsc-send', packet, connect);
                });*/
            });
            this._SystemBus.on('proc-return-systemdata', (ph) => {
                this._LoggerBus.emit('logInfo', "Meta data updated!");
                this._SystemBus.emit('proc-connections-done', this._SourcesInfo);
            });
        }
    }
    Run() {
        // Генерация события для каждого клиента - сигнал, что объект с подключениями готов
        this.GetSourceClients().forEach(source => {
            this._SystemBus.emit(source.genEvent, this._SourcesInfo);
        });
    }
    /**
     * @method
     * Возвращает из базы данных список доступных клиентов и имена событий для генерации
     * @returns Array[Object]   sources - массив объектов с описанием клиентов
     */
    GetSourceClients() {// Заглушка
        let sources = [{id: 0, name: "WebSocket", genEvent: "ws-addr-cast"}];
        return sources;
    }        
    /**
     * @method
     * Формирует объект подключений на основе данных из БД
     */
    FormSysInfo() {            
        this.#_SourcesInfo = new Sources();
    }
    get _SourcesInfo() {
        return this.#_SourcesInfo;
    }
}

module.exports = ProcessSrv;