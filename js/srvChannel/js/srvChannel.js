const ClassBaseService_S = require('../../srvService/js/srvService.js');
const ClassValueBuffer = require('../../srvUtils/js/buffer.js');
const generateHash = require('../../srvUtils/js/generateHash');

// ### ПОДПИСКИ
const COM_DM_NEW_CH = 'dm-new-channel';

// EMITS
const COM_PMDB_DEV_CONF_GET = 'providermdb-device-config-get';

const COM_CH_ALARM = 'all-ch-alarm';
const COM_ALL_CH_NEW = 'all-ch-new';
const COM_ALL_INIT1 = 'all-init-stage1-set';

const COM_ALL_CH_STATUS_GET = 'all-ch-status-get';
const COM_ALL_CH_STATUS_SET = 'all-ch-status-set';

const COM_ALL_CH_CONFIG_GET = 'all-ch-config-get';
const COM_ALL_CH_CONFIG_SET = 'all-ch-config-set';

// ### ПРОЧЕЕ
const DEV_CONF_GET_TIMEOUT = 500;

const STATUS_ACTIVE = 'active';
const STATUS_INACTIVE = 'inactive';

const CONST_UNKNOWN = 'unknown';
const VALUE_TYPE_NUMBER = 'number';
const VALUE_TYPE_STRING = 'string';

/**
 * @typedef DeviceOptsType 
 * @property {String} name
 * @property {String} article
 * @property {String} module
 * @property {string} description
 * @property {String} type
 * @property {[String]} channelNames
 * @property {[String]} channelMeasures
 */

function importFunc(filterName, ch) {
    return () => { };
}

/**
 * @class 
 * Самый "старший" предок в иерархии классов датчиков. 
 * В первую очередь собирает в себе самые базовые данные о датчике: переданные шину, пины и тд. Так же сохраняет его описательную характеристику: имя, тип вх. и вых. сигналов, типы шин которые можно использовать, количество каналов и тд.
 */
class ClassDeviceInfo {
    /**
     * @constructor
     * @param {DeviceOptsType} _opts - объект с описательными характеристиками датчика и параметрами, необходимых для обеспечения работы датчика
     */
    constructor(_opts) {
        this._Id = _opts.id;
        this._Name = _opts.name;
        this._Module = _opts.module;
        this._Description = _opts.description;
        this._Type = 'sensor';
        this._Article = _opts.article;
        this._QuantityChannel = _opts.quantityChannel;
        this._ChannelNames = _opts.channelNames;
        this._ChannelMeasures = _opts.channelMeasures;
    }

    get Name() { return this._Name; }

    get Article() { return this._Article; }

    get ChNames() { return this._ChannelNames; }

    get Description() { return this._Description; }

    get ChannelNames() { return this.ChannelNames; }

    get ChannelMeasures() { return this.ChannelMeasures; }

    /**
     * @method
     * Метод проверяет корректность полей объекта
     */
    CheckProps() {
        //#region функции которые можно вынести в утилитарный класс
        const isStringNonEmpty = (p) => typeof p === 'string' && p.length > 0;
        //#endregion

        if (!isStringNonEmpty(this._Article)) throw new Error(`Invalid _Article`);
        if (!isStringNonEmpty(this._Name)) throw new Error(`Invalid _Name`);
        if (!isStringNonEmpty(this._Type)) throw new Error(`Invalid _Type`);
    }
}
/**
 * @class
 */
class ClassBaseChannel_S extends ClassBaseService_S {
    #_ValueType;
    #_ValueKey;

    #_ChType;
    #_ChAlias;
    #_ChMeas;
    #_SourceName;
    #_ChNum;
    #_DeviceId;
    #_DeviceIdHash;
    #_Address;
    #_StateChName;
    #_Group_1 = [];
    #_Group_2 = [];
    #_Group_3 = [];
    /**
     * @typedef TypeServiceOpts
     * @property {[ClassBus_S]} _busList
     * @property {[string]} _busNameList
     */
    /**
     * @typedef TypeChOpts
     * @property {string} SourceName, 
     * @property {string} DeviceId 
     * @property {number} ChNum
     */
    /**
     * @constructor 
     * @param {TypeServiceOpts} _serviceOpts 
     * @param {TypeChOpts} _chOpts 
     * @param {ClassDeviceInfo} _deviceInfo 
     */
    constructor({ _busList, _busNameList, _advOpts }) {
        const service_name = _advOpts.Name ?? _advOpts.ChAlias;
        super({ _name: service_name, _busNameList, _busList });
        // Основные поля
        // идентификация
        this.#_DeviceId = _advOpts.DeviceId;
        this.#_ChNum = _advOpts.ChNum;
        this.#_SourceName = _advOpts.SourceName;
        this.#_ChAlias = _advOpts.ChAlias;
        this.#_Address = _advOpts.Address;
        this.#_StateChName = _advOpts.StateChName;
        this.#_DeviceIdHash = _advOpts.DeviceIdHash;
        // свойства для работы
        this.#_ValueType = [VALUE_TYPE_NUMBER, VALUE_TYPE_STRING].includes(_advOpts.ValueType)
            ? _advOpts.ValueType : VALUE_TYPE_NUMBER;
        this.#_ValueKey = _advOpts.ValueKey;
        // описание
        this.#_ChType = _advOpts.ChType;
        this.#_ChMeas = _advOpts.ChMeas;
        // группы
        this.#_Group_1 = Array.isArray(_advOpts.Group_1) ? _advOpts.Group_1 : this.#_Group_1;
        this.#_Group_2 = Array.isArray(_advOpts.Group_2) ? _advOpts.Group_2 : this.#_Group_2;
        this.#_Group_3 = Array.isArray(_advOpts.Group_3) ? _advOpts.Group_3 : this.#_Group_3;
    }
    /**
     * @getter
     * Возвращает уникальный идентификатор канала
     */
    get ID() { return generateHash(this.Name, '-'); }

    /**
     * @getter
     * @description возвращает идентификатор канала в формате <deviceId>-<chNum>, который используется в ws/lhp 
     */
    get NameLHP() { return `${this.#_DeviceId}-${this.#_ChNum}` }
    /**
     * 
     */
    get SourceName() { return this.#_SourceName; }

    /**
     * @getter
     * @public
     * @description Возвращает имя девайса
     */
    get DeviceId() { return this.#_DeviceId; }

    /**
     * @getter
     * @public
     * @description Возвращает номер/идентификатор канала в контексте девайса 
     */
    get ChNum() { return this.#_ChNum; }

    /**
     * @getter
     * @public
     * @description Возвращает тип данных Value: number | string 
     */
    get ValueType() { return this.#_ValueType; }

    /**
     * @getter
     * @public
     * @description Возвращает имя ключа по которому поступают данные
     * @returns {string} 
     */
    get ValueKey() { return this.#_ValueKey; }

    /**
     * @getter
     * @public
     * @description Возвращает список групп канала 
     */
    get Group_1() { return this.#_Group_1; }
    get Group_2() { return this.#_Group_2; }
    get Group_3() { return this.#_Group_3; }

    /**
     * @getter
     * @public
     * @description Возвращает alias канала
     */
    get ChAlias() { return this.#_ChAlias; }

    /**
     * @getter
     * @public
     * @description Возвращает строковое обозначение единицы измерения показаний канала
     */
    get ChMeas() { return this.#_ChMeas; }

    /**
     * @getter
     * @public
     * @description Возвращает строковое тип канала "сенсор" | "актуатор"
     */
    get ChType() { return this.#_ChType; }
    /**
     * @getter
     * @public
     * @description Возвращает ID устройства, к которому относится канал
     */
    get DeviceIdHash() { return this.#_DeviceIdHash; }

    /**
     * @getter
     * @description Возвращает mqtt-топик 
     */
    get Address() { return this.#_Address; }

    get StateChName() { return this.#_StateChName; }
}

/**
 * @class
 * @description Класс, представляющий каждый отдельно взятый канал датчика в качестве службы фреймворка.
 */
class ClassChannel_S extends ClassBaseChannel_S {
    #_MappingCompleted = false;
    #_Activated = false;
    #_ChangeThreshold;

    #_DeviceInfo = null;
    #_ValueBuffer = null;
    #_Transform = null;
    #_Suppression = null;
    #_Filter = null;
    #_Alarms = null;

    #_Proxy = null;
    #_SavingValues = { raw: false, fine: true };

    constructor({ _busList, _busNameList, _advOpts }) {
        // имя службы - поле Name канала
        super({ _busList, _busNameList, _advOpts });
        // работа с БД
        this.SetSavingValues(_advOpts?.SavingValues);
        // математическая конфигурация
        this.#_ChangeThreshold = typeof _advOpts.ChangeThreshold == 'number' ? _advOpts.ChangeThreshold : 0;
        if (this.ValueType == VALUE_TYPE_NUMBER)
            this.SetupMathChannel(_advOpts.Config);
        // подписка на init
        this.FillEventOnList('sysBus', [COM_ALL_INIT1]);
        this.FillEventOnList('dataBus', [COM_ALL_CH_STATUS_SET]);
    }

    get Buffer() { return this.#_ValueBuffer; }

    get DeviceInfo() { return this.#_DeviceInfo; }

    get Alarms() { return this.#_Alarms; }

    get Suppression() { return this.#_Suppression; }

    get Transform() { return this.#_Transform; }

    get Filter() { return this.#_Filter; }

    /**
    * @getter
    * @public
    * @description Возвращает имя канала согласно имеющейся информации об устройстве 
    */
    get ChName() {
        const ch_names = this.#_DeviceInfo?.ChannelNames;
        return Array.isArray(ch_names) ? ch_names[this.ChNum] : CONST_UNKNOWN;
    }

    /**
     * @getter
     * Возвращает статус службы: active/inactive
     * active - служба сопоставлена с каналом источника, подключение к источнику есть
     */
    get Status() {
        return (this.SourcesState[this.SourceName]?.IsConnected && this.#_MappingCompleted && this.#_Activated) ? STATUS_ACTIVE : STATUS_INACTIVE;
    }

    /**
     * @getter
     * Возвращает установленный для канала порог изменения - процент, на который должно измениться Value чтобы SM считал его новым.
     */
    get ChangeThreshold() {
        return this.#_ChangeThreshold;
    }

    /**
     * @getter
     * @public
     * @description Возвращает протокол источника, к которому привязана служба-канал
     * @returns {string}
     */
    get Protocol() {
        if (!this.SourcesState[this.SourceName]) {
            this.EmitEvents_logger_log({ level: 'W', msg: `Source named ${this.SourceName} not found!` });
            return;
        }
        return this.SourcesState[this.SourceName].Protocol;
    }

    /**
     * @getter
     * @public
     * @description Возвращает имя шины по которой ведется взаимодействие с прокси-службой
     * @returns {string}
     */
    get ProtocolBusName() {
        if (!this.SourceName) return 'dataBus';
        let proxyService = Object.values(this.ServicesState)
            .find(_service => _service.Name.toLowerCase().includes('proxy') && _service.Protocol === this.Protocol);
        if (!proxyService) {
            this.EmitEvents_logger_log({ level: 'W', msg: `Service named proxy* with Protocol == '${this.Protocol}' not found!` });
            return;
        }
        if (!proxyService.PrimaryBus) {
            this.EmitEvents_logger_log({ level: 'W', msg: `Chosen proxy has property PrimaryBus == null!` });
            return;
        }
        // определение типа подключения
        // return Object.values(this.ServicesState)
        //     .find(_service => _service.Name.toLowerCase().includes('proxy') && _service.Protocol === this.Protocol)
        //     .PrimaryBus;
        return this.ServicesState[proxyService.Name].PrimaryBus;
    }
    /**
     * @getter
     * @public
     * @description Возвращает протокол источника, к которому привязана служба-канал
     * @returns {Proxy}
     */
    get ProxyObject() {
        try {
            this.#_Proxy ??= new Proxy(this, {
                get: (target, prop, receiver) => {
                    if (typeof prop === 'string') {
                        if (prop.startsWith('EmitEvent_') || prop.startsWith('HandlerEvents_'))
                            return undefined;

                        return target[prop];
                    }
                    return undefined;
                },
                set(obj, prop, value) {
                    return false;
                }
            });
        } catch (e) {
            console.log(`err ${e}`);
        }
        return this.#_Proxy;
    }
    /**
     * @typedef TypeSavingValues
     * @property {boolean} raw
     * @property {boolean} fine
     */
    /**
     * @getter
     * @public
     * @description Возвращает какие значения записываются в БД
     * @returns {TypeSavingValues}
     */
    get SavingValues() { return { ...this.#_SavingValues }; }

    /**
     * @method 
     * @description Устанавливает свойства raw и fine поля #_SavingValues.
     * @param {TypeSavingValues} _savingValues 
     * @returns {void}
     */
    SetSavingValues(_savingValues) {
        this.#_SavingValues = { raw: _savingValues?.raw ?? this.#_SavingValues.raw, fine: _savingValues?.fine ?? this.#_SavingValues.fine };
    }
    /**
     * @typedef TransformOpts
     * @property {number} k
     * @property {number} b
    */
    /**
     * @typedef SuppressionOpts
     * @property {number} low
     * @property {number} high
    */
    /**
     * @typedef ZonesOpts
     * @property {ZoneOpts} red
     * @property {ZoneOpts} yellow
     * @property {object} green
    */
    /**
     * @typedef ZoneOpts
     * @property {number} low
     * @property {number} high
     * @property {Function} cbLow
     * @property {Function} cbHigh
    */
    /**
     * @typedef ChConfigOpts
     * @property {TransformOpts} transform
     * @property {SuppressionOpts} suppression
     * @property {ZoneOpts} zones
     * @property {number} buffer
     */
    /**
     * @method
     * @public
     * @description Конфигурирует обработку данных на канале 
     * @param {ChConfigOpts} _config 
     */
    SetupMathChannel(_config = {}) {
        this.#_ValueBuffer = new ClassValueBuffer(_config.buffer);
        this.#_Transform = new ClassTransform(_config.transform);
        this.#_Suppression = new ClassSuppression(_config.suppression);
        this.#_Alarms = null;
        if (_config.zones) {
            this.EnableAlarms();
            this.#_Alarms.SetZones(_config.zones);
        }
    }
    /**
     * @method
     * @description Возвращает объект с текущей конфигурацией
     * @returns {ChConfigOpts}
     */
    ToConfig() {
        return ({
            buffer: this.#_ValueBuffer.ToConfig(),
            transform: this.#_Transform.ToConfig(),
            suppression: this.#_Suppression.ToConfig(),
            zones: this.Alarms?.ToConfig()
        });
    }

    /**
     * @method
     * @public
     * @description Обрабатывает полученный от plc или прокси службы-источника список каналов.
     */
    HandlerEvents_dm_deviceslist_set(_topic, _msg) {
        const [msg_lhp] = _msg.value;
        // извлечение списка каналов
        // { sensor: [...], actuator: [...] }
        const [sens_act_lists] = msg_lhp.value;
        const [source_name] = _msg.arg;
        // ChType - всегда ключ 'sensor' | 'actuator'
        const list_includes_ch = sens_act_lists[this.ChType]?.find(_note => _note === this.Name || _note === this.NameLHP);
        if (list_includes_ch && source_name === this.SourceName) {
            this.#_MappingCompleted = true;
            this.#_Activated = true;
        }
    }

    /**
     * @method
     * @public
     * @description Обрабатывает получение конфигурации устройств. 
     * @param {string} _topic 
     * @param {ClassBusMsg_S} _msg 
     */
    HandlerEvents_all_device_config_set(_topic, _msg) {
        const [device_info_list] = _msg.value;
        const device = device_info_list.find(_device => _device.id === this.DeviceIdHash);

        if (!device) {
            this.EmitEvents_logger_log({ level: 'W', msg: `DeviceInfo for ${this.DeviceIdHash} is not found` });
            return;
        }

        try {
            this.#_DeviceInfo = new ClassDeviceInfo(device);
        } catch (e) {
            this.EmitEvents_logger_log({ level: 'E', msg: 'Failed to create DeviceInfo obj', obj: device });
        }
    }

    /**
     * @method
     * @public
     * @description Обрабатывает событие об отключении источника: проверяет не относится ли данный канал к нему
     * @returns 
     */
    HandlerEvents_all_source_disconnected(_topic, _msg) {
        let [source_name] = _msg.arg;
        if (source_name == this.SourceName)
            this.EmitEvents_all_ch_status_get();
    }

    /**
     * @method
     * @public
     * @description Обрабатывает событие об отключении источника: проверяет не относится ли канал к нему
     * @returns 
     */
    HandlerEvents_all_ch_status_set(_topic, _msg) {
        let [ch_name] = _msg.arg;
        let [status] = _msg.value;
        if (ch_name == this.Name) {
            this.#_Activated = status.toLowerCase() == STATUS_ACTIVE;
            this.EmitEvents_all_ch_status_get();
        }
    }

    HandlerEvents_all_ch_config_set(_topic, _msg) {
        const { hash } = _msg.metadata;
        let [ch_name] = _msg.arg;
        let [config] = _msg.value;
        if (ch_name == this.Name) {
            this.SetupMathChannel(config);
            this.EmitEvents_all_ch_config_get({ hash });
        }
    }

    /**
     * @method
     * @public
     * @description Отправляет сообщение о деактивации канала
     * @returns 
     */
    EmitEvents_all_ch_status_get() {
        const msg = {
            dest: 'all',
            com: COM_ALL_CH_STATUS_GET,
            arg: [this.Name],
            value: [this.Status]
        }
        this.EmitMsg('dataBus', msg.com, msg);
    }

    EmitEvents_all_ch_new() {
        const msg = {
            dest: 'all',
            com: COM_ALL_CH_NEW,
            arg: [this.Name],
            value: [
                Object.fromEntries(
                    ['Name', 'ChName', 'SourceName', 'Address', 'ChType', 'DeviceId', 'ChMeas'].map(prop => [prop, this[prop]])
                )
            ]
        }
        this.EmitMsg('dataBus', msg.com, msg);
    }

    /**
     * @method
     * @public
     * @description Отправляет сообщение с конфигурацией канала
     * @returns 
     */
    EmitEvents_all_ch_config_get({ hash }) {
        const msg = {
            hash,
            dest: 'all',
            com: COM_ALL_CH_CONFIG_GET,
            arg: [this.Name],
            value: [this.ToConfig()]
        }
        this.EmitMsg('dataBus', msg.com, msg);
    }

    /**
     * @method
     * @public
     * @description Отправляет на providermdb показания канала.
     */
    EmitEvents_providermdb_data_write({ arg, value }) {
        const msg = {
            dest: 'providermdb',
            com: 'providermdb-data-write',
            arg,
            value
        }
        this.EmitMsg('mdbBus', msg.com, msg);
    }


    /**
     * @method
     * @public
     * @description Отправляет запрос на получение данных об устройствах
     * @returns 
     */
    async EmitEvents_providermdb_device_config_get() {
        const msg = {
            dest: 'providermdb',
            demandRes: true,
            com: COM_PMDB_DEV_CONF_GET,
        }
        this.EmitMsg('mdbBus', msg.com, msg, { timeout: DEV_CONF_GET_TIMEOUT });
    }

    /**
     * @method
     * @public
     * @description Отправляет на шину сообщение о своей инициализации
     */
    EmitEvents_dm_new_channel() {
        const msg = {
            dest: 'dm',
            com: COM_DM_NEW_CH,
            arg: [this.Name],
            value: [this]
        }
        this.EmitMsg('sysBus', msg.com, msg);
    }

    /**
     * @method
     * @public
     * @description Отправляет на шину сообщение с текущим состоянием зон канала
     */
    EmitEvents_all_ch_alarm() {
        const msg = {
            dest: 'all',
            com: COM_CH_ALARM,
            arg: [this.Name],
            value: [this.#_Alarms.ZonesState]
        }
        this.EmitMsg('dataBus', msg.com, msg);
    }

    /**
     * @method
     * Инициализирует ClassAlarms в полях объекта.  
     */
    EnableAlarms() {
        this.#_Alarms = new ClassAlarms(this);
        this.#_Alarms.SetChannelCb(this.EmitEvents_all_ch_alarm.bind(this));
    }
}

/**
 * @class
 * Класс реализует функционал для обработки числовых значений по задаваемым ограничителям (лимитам) и функцией
 */
class ClassTransform {
    #_TransformFunc;
    #_K;
    #_B;
    constructor(_opts) {
        if (typeof _opts?.k == 'number' && typeof _opts?.b == 'number') {
            this.#_K = _opts.k;
            this.#_B = _opts.b;
            this.SetLinearFunc(_opts.k, _opts.b);
        } else {
            this.#_K = 1;
            this.#_B = 0;
            this.#_TransformFunc = (x) => x;
        }
    }
    /**
     * @method
     * Задает функцию, которая будет трансформировать вх.значения.
     * @param {Function} _func 
     * @returns 
     */
    SetFunc(_func) {
        this.#_K = undefined;
        this.#_B = undefined;
        if (!_func) {
            this.#_TransformFunc = (x) => x;
            return true;
        }
        if (typeof _func !== 'function') return false;
        this.#_TransformFunc = _func;
        return true;
    }
    /**
     * @method
     * Устанавливает коэффициенты k и b трансформирующей линейной функции 
     * @param {Number} _k 
     * @param {Number} _b 
     */
    SetLinearFunc(_k, _b) {
        if (typeof _k !== 'number' || typeof _b !== 'number') throw new Error('k and b must be values');
        this.#_TransformFunc = (x) => _k * x + _b;
        return true;
    }
    /**
     * @method
     * Возвращает значение, преобразованное линейной функцией
     * @param {Number} val 
     * @returns 
     */
    TransformValue(val) {
        return this.#_TransformFunc(val);
    }
    /**
     * @method
     * @description Возвращает объект с текущей конфигурацией
     * @returns {TransformOpts}
     */
    ToConfig() {
        if (typeof _opts?.k == 'number' && typeof _opts?.b == 'number')
            return ({ k: this.k, b: this.b });
        else
            return { func: this.#_TransformFunc.toString() };
    }
}
/**
 * @class
 * Класс реализует функционал супрессии вх. данных
 */
class ClassSuppression {
    constructor(_opts) {
        this._Low = -Infinity;
        this._High = Infinity;
        if (_opts)
            this.SetLim(_opts.low, _opts.high);
    }
    /**
     * @method
     * Метод устанавливает границы супрессорной функции
     * @param {Number} _limLow 
     * @param {Number} _limHigh 
     */
    SetLim(_limLow, _limHigh) {
        if (typeof _limLow !== 'number' || typeof _limHigh !== 'number') throw new Error('Not a number');

        if (_limLow >= _limHigh) throw new Error('limLow value should be less than limHigh');
        this._Low = _limLow;
        this._High = _limHigh;
        return true;
    }
    /**
     * @method
     * Метод возвращает значение, прошедшее через супрессорную функцию
     * @param {Number} _val 
     * @returns {Number}
     */
    SuppressValue(_val) {
        return _val > this._High ? this._High
            : _val < this._Low ? this._Low
                : _val;
    }
    /**
     * @method
     * @description Возвращает объект с текущей конфигурацией
     * @returns {SuppressionOpts}
     */
    ToConfig() {
        return ({ limLow: this._Low, limHigh: this._High });
    }
}

const indexes = { redLow: 0, yelLow: 1, green: 2, yelHigh: 3, redHigh: 4 };

/**
 * @typedef ZonesOpts - Объект, задающий все либо несколько зон измерения а также их оповещения
 * @property {ZoneOpts} red - красная зона
 * @property {ZoneOpts} yellow - желтая зона
 * @property {GreenZoneOpts} green - зеленая зона
*/
/**
 * @typedef ZoneOpts - Объект, описывающий красную и желтую зоны измерения
 * @property {Number} limLow - нижняя граница
 * @property {Number} limHigh - верхняя граница
 * @property {Function} cbLow - аларм нижней зоны
 * @property {Function} cbHigh - аларм верхней зоны
*/
/**
 * @typedef GreenZoneOpts - Объект, описывающий зеленую зону измерения
 * @property {Function} cb
*/
/**
 * @class
 * Реализует функционал для работы с зонами и алармами 
 * Хранит в себе заданные границы алармов и соответствующие им колбэки.
 * Границы желтой и красной зон определяются вручную, а диапазон зеленой зоны фактически подстраивается под желтую (или красную если желтая не определена).
 * 
 */
class ClassAlarms {
    /**
     * @constructor
     * @param {ClassChannel_S} _channel 
     */
    constructor(_channel) {
        this._Channel = _channel;   // ссылка на объект сенсора
        this._CurrZone = 'green';
        this.SetDefault();
    }
    /**
     * @getter 
     * Возвращает объект, в котором ключ - имя зоны, а значение 0 или 1.  
     */
    get ZonesState() {
        const list = { redLow: 0, yelLow: 0, green: 0, yelHigh: 0, redHigh: 0 };
        list[this._CurrZone] = 1;
        return list;
    }
    /**
     * @getter
     * @public
     * @description Имя текущей зоны  redLow | yelLow | green | yelHigh | redHigh
     */
    get CurrZone() {
        return this._CurrZone;
    }
    /**
     * @method
     * @public
     * @description Устанавливает коллбэк, который вызывается для уведомления канала о смене текущей зоны
     * @param {Function} _cb 
     */
    SetChannelCb(_cb) {
        this._ChannelCb = _cb;
    }
    /**
     * @method
     * Устанавливает значения полей класса по-умолчанию
     */
    SetDefault() {
        this._Zones = [];
        this._Callbacks = new Array(5).fill((ch, z) => { });
        this._CurrZone = 'green';
    }
    /**
     * @method
     * Устанавливает новый колбэк если он верно передан.
     * Метод не предназначен для вызова пользователем.
     * @param {Number} _ind 
     * @param {Function} _cb 
     * @returns 
     */
    SetCallback(_ind, _cb) {
        if (typeof _cb === 'function') {
            this._Callbacks[_ind] = _cb;
            return true;
        }
        return false;
    }
    /**
     * @method
     * Метод, который задает зоны измерения и их функции-обработчики
     * @param {ZonesOpts} _opts 
     */
    SetZones(_opts) {
        if (!_opts) return false;

        if (!this.CheckOpts(_opts)) return false;

        if (_opts.yellow) {
            this._Zones[indexes.yelLow] = _opts.yellow.low;
            this._Zones[indexes.yelHigh] = _opts.yellow.high;
        }
        if (_opts.red) {
            this._Zones[indexes.redLow] = _opts.red.low;
            this._Zones[indexes.redHigh] = _opts.red.high;
        }
    }
    /**
     * @method
     * Проверяет корректность переданных настроек зон измерения и алармов
     * @param {ZonesOpts} opts 
     * @returns 
     */
    CheckOpts(opts) {
        let yellow = opts.yellow;
        let red = opts.red;

        if (yellow) {
            if (yellow.low >= yellow.high)                            //если нижняя граница выше верхней
                return false;
            if (opts.red) {                         //если переданы настройки красной зоны, сравниваем с ними
                if (yellow.low < red.low || yellow.high > red.high)
                    return false;
            }                                       //иначе сравниваем с текущими значениями
            else if (yellow.low < this._Zones[indexes.redLow] || yellow.high > this._Zones[indexes.redHigh])
                return false;
        }
        if (red) {
            if (red.low >= red.high)                //если нижняя граница выше верхней
                return false;

            if (!yellow) {                          //если не переданы настройки желтой зоны, сравниваем с текущими
                if (opts.red.low > this._Zones[indexes.yelLow] || opts.red.high < this._Zones[indexes.yelHigh])
                    return false;
            }
        }
        return true;
    }
    /**
     * @method
     * Метод обновляет значение текущей зоны измерения по переданному значению и, если зона сменилась, вызывает её колбэк
     * @param {Number} val 
     */
    CheckZone(val) {
        let prevZone = this._CurrZone;
        this._CurrZone = val < this._Zones[indexes.redLow] ? 'redLow'
            : val > this._Zones[indexes.redHigh] ? 'redHigh'
                : val < this._Zones[indexes.yelLow] ? 'yelLow'
                    : val > this._Zones[indexes.yelHigh] ? 'yelHigh'
                        : 'green';

        if (prevZone !== this._CurrZone) {
            this._ChannelCb?.();
            this._Callbacks[indexes[this._CurrZone]](this._Channel, prevZone);
        }
    }
    /**
     * @method
     * @description Возвращает объект с текущей конфигурацией
     * @returns {ZonesOpts}
     */
    ToConfig() {
        return ({
            yellow: {
                low: this._Zones[indexes.yelLow],
                high: this._Zones[indexes.yelHigh]
            },
            red: {
                low: this._Zones[indexes.redLow],
                high: this._Zones[indexes.redHigh]
            }
        });
    }

}

module.exports = ClassChannel_S;