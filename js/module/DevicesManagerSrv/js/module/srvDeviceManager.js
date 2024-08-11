const EVENT_DM_READY   = 'dm-ready';
const EVENT_DM_LIST_GET= 'dm-deviceslist-get';
const EVENT_PWSC_SEND  = 'pwsc-send';
const EVENT_DM_CREATED = 'dm-created';
const EVENT_CONNS_DONE = 'proc-connections-done';
const EVENT_PMQTT_SEND = 'pmqtt-send';
const EVENT_DM_NEW_CH  = 'dm-new-ch';

const COM_GET_DEVLIST  = 'dm-deviceslist-get';
const COM_SUB_SENS_ALL = 'dm-sub-sensorall';


module.exports = (dependencies) => {
    const { SystemBus, ClassChannelSensor, ClassSensorInfo, ProxyDB, Process } = dependencies;
    const GET_INFO_TIMEOUT = 3000;
    /**
     * @class
     * Реализует функционал службы для работы с измерительными каналами подключенного контроллера. Обеспечивает создание виртуальных двойников измерительных каналов, обработку их показаний, а также отправку команд 
     */
    class ClassDeviceManager {
        #_Channels = [];
        #_DeviceInfo = [];              //список ClassSensorInfo

        #_ReqSent = 0;
        #_ResReceived = 0;                    

        constructor() {
            // оповещение о том что получены ответы на команду get-info 
            const readyCallback = () => {
                SystemBus.emit(EVENT_DM_READY, { 
                    requests: this.#_ReqSent,
                    responses: this.#_ResReceived
                });
                
                // Обновление кол-ва каналов от каждого подключения
                this.UpdateSysInfoChCount();

                this.#_ReqSent = 0; 
                this.#_ResReceived = 0;

                clearTimeout(this._GetInfoTimeout);
                this._GetInfoTimeout = null;
            }
            // получена информация о списке каналов с одного источника  
            SystemBus.on(EVENT_DM_LIST_GET, (info, sourceName) => {
                this.#OnChannelsInfo(info, sourceName);
                // соединение, с которого пришел ответ
                const conn = Process.SystemInfo.Connections.find(conn => conn._sourceName == sourceName);
                conn._providedDeviceInfo = true;
                // подписка на показания каналов
                this.SubSensAll(conn);

                console.log(`DEBUG>> res rec from ${conn._sourceName} total: ${++this.#_ResReceived}`);

                if (this.#_ResReceived === this.#_ReqSent)
                    readyCallback();

                SystemBus.emit(EVENT_DM_CREATED, this);
            });

            // Process передал список подключений, по которым будет выполнен запрос на получение списка каналов 
            SystemBus.on(EVENT_CONNS_DONE, () => {
                if (this._GetInfoTimeout) return;

                Process.SystemInfo.Connections
                    .filter(conn => conn._isConnected && !conn._providedDeviceInfo)
                    .forEach(conn => {
                        this.GetChannelsInfo(conn);
                        console.log(`DEBUG>> req sent to ${conn} total: ${++this.#_ReqSent}`);
                });
                
                // завершение ожидания по таймауту
                this._GetInfoTimeout = setTimeout(readyCallback, GET_INFO_TIMEOUT);
            });
        }

        get SensorChannels() {
            return this.#_Channels.filter(ch => ch instanceof ClassChannelSensor);
        }

        get ChannelsList() {
            const list = {};
            this.SensorChannels.forEach(ch => {
                list[ch.ID] = { 
                    article: ch.Info.Article, 
                    name: ch.Info.Name, 
                    chName: '' 
                };
            }, {});
            return list;
        }
            
        /**
         * @method
         * Добавляет канал в реестр
         * @param {Object} ch 
         */
        #AddChannel(ch) {
            if (this.IsIDUnique(ch.ID)) {
                this.#_Channels.push(ch);
            }
        }

        /**
         * @method
         * @param {string} id 
         * Возвращает устройство с соответствующим id
         * @returns 
         */
        GetChannel(id) {
            return this.#_Channels.find(ch => ch.ID === id);
        }

        /**
         * @method
         * Создает объект ClassSensorInfo
         * @param {string} _article 
         * @returns {ClassSensorInfo}
         */
        #CreateDeviceInfo(_article) {
            // TODO
            // Обращение в БД 
            return { _Article: _article };
        }

        /**
         * @method
         * Обрабатывает поступление списка каналов с одного источника
         * @param {[String]} _infoStrings - массив строк формата <article>-<sens_id>-<ch_num>
         * @param {String} _sourceId - идентификатор источника
         */
        #OnChannelsInfo(_infoStrings, _sourceId) {
            _infoStrings.forEach(infoString => {
                const [ article, id, chNum ] = infoString.split('-');

                if (!this.#_DeviceInfo.find(dev => dev._Article === article))  
                    this.#_DeviceInfo.push(this.#CreateDeviceInfo(article));      // добавление объекта info в коллекцию

                // TODO: в зависимости от info создавать либо канал сенсора либо актуатора
                const ch = this.#CreateChannelSensor(_sourceId, id, chNum, article);
                console.log(`DEBUG>> Create ch ${ch.ID}`);
                this.#AddChannel(ch);
            });
        }

        /**
         * @method
         * Проверяет ID сенсора/актуатора и возвращает булевое значение, указывающее можно ли этот ID использовать.
         * @param {string} _id 
         */
        IsIDUnique(_id) {
            return !Boolean(this.#_Channels.find(ch => ch.ID === _id));
        }

        /**
         * @method
         * Инициализирует канал датчика
         * @param {string} _sourceId - идентификатор источника (контроллера/виртуального датчика/брокера)
         * @param {string} _deviceID - идентификатор датчика на контроллере
         * @param {string} _chNum - номер канала датчика 
         * @param {string} _article - артикль датчика
         * @returns {ClassChannelSensor}
         */
        #CreateChannelSensor(_sourceId, _deviceID, _chNum, _article) {
            const chId = `${_sourceId}-${_deviceID}-${_chNum}`;
            const chConfig = this.GetChannelConfig(chId);
            const deviceInfo = this.#_DeviceInfo.find(dev => dev._Article === _article);
            const ch = new ClassChannelSensor(deviceInfo, { sourceId: _sourceId, deviceId: _deviceID, chNum: +_chNum }, chConfig);

            SystemBus.emit(EVENT_DM_NEW_CH, ch.ID);
            return ch;
        }

        /**
         * @method
         * Отправляет запрос на получение списка каналов
         * @param {object} _connectionId - идентификатор подключения
         */
        GetChannelsInfo(_connection) {
            if (_connection._type == 'plc')
                SystemBus.emit(EVENT_PWSC_SEND, { com: COM_GET_DEVLIST, arg: [] }, _connection._sourceName);
            if (_connection._type == 'broker')
                SystemBus.emit(EVENT_PMQTT_SEND, { com: COM_GET_DEVLIST, arg: [] }, _connection._sourceName);
        }

        /**
         * @method
         * Выполнение подписки на DM контроллера
         * @param {object} _connection - идентификатор соединения
         */
        Sub(_connection) {
            if (_connection._type == 'plc')
                SystemBus.emit(EVENT_PWSC_SEND, { com: 'dm-sub', arg: [] }, _connection._sourceName);
        }

        SubSensAll(_connection) {
            SystemBus.emit(EVENT_PWSC_SEND, { com: COM_SUB_SENS_ALL, arg: [] }, _connection._sourceName);
        }

        /**
         * @method
         * Вызов метода сенсора или актуатора
         * @param {string} _id 
         * @param {string} _methodName 
         * @param  {...any} args 
         */
        Execute(_id, _methodName, ...args) {
            SystemBus.emit(EVENT_PWSC_SEND, { com: 'dm-execute', arg: [_id, _methodName, ...args] });
        }

        /**
         * @method
         * Возвращает конфиг канала
         * @param {string} _id 
         * @returns 
         */
        GetChannelConfig(_id) {
            // TODO: обращение к БД
            return ProxyDB.GetConfig(_id);
        }
        /**
         * @method
         * Обновляет кол-во каналов от каждого подключения
         */
        UpdateSysInfoChCount() {
            Process.SystemInfo.Connections.forEach(conn => {
                conn._chCount = this.#_Channels.filter(ch => ch.SourceName === conn._sourceName).length;
            });
        }
    }
    return ClassDeviceManager;
}
