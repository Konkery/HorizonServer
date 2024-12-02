const ClassBaseService_S = require('srvService');
const generateHash = require('generateHash.js');

// ### ПОДПИСКИ
const COM_DATA_RAW_GET    = 'all-data-raw-get';
const COM_ALL_DEVINFO_SET = 'all-device-config-set';
const COM_DM_DEVLIST_SET  = 'dm-deviceslist-set';
const COM_DM_NEW_CH       = 'dm-new-channel';
// EMITS
const COM_DATA_FINE_SET     = 'all-data-fine-set';
const COM_PMDB_DEV_CONF_GET = 'providermdb-device-config-get';

const COM_CH_ALARM = 'all-ch-alarm';
const COM_ALL_INIT1 = 'all-init-stage1-set';

// ### ПРОЧЕЕ
const DEV_CONF_GET_TIMEOUT = 500;

const STATUS_ACTIVE = 'active';
const STATUS_INACTIVE = 'inactive';

const CONST_UNKNOWN = 'unknown';

/**
 * @typedef SensorOptsType 
 * @property {String} name
 * @property {String} article
 * @property {String} module
 * @property {string} description
 * @property {String} type
 * @property {[String]} channelNames
 * @property {[String]} channelMeasures
 */
/**
 * @class 
 * Самый "старший" предок в иерархии классов датчиков. 
 * В первую очередь собирает в себе самые базовые данные о датчике: переданные шину, пины и тд. Так же сохраняет его описательную характеристику: имя, тип вх. и вых. сигналов, типы шин которые можно использовать, количество каналов и тд.
 */
class ClassSensorInfo {
    /**
     * @constructor
     * @param {SensorOptsType} _opts - объект с описательными характеристиками датчика и параметрами, необходимых для обеспечения работы датчика
     */
    constructor(_opts) {
        this._Id          = _opts.id;
        this._Name        = _opts.name;
        this._Module      = _opts.module;
        this._Description = _opts.description;
        this._Type        = 'sensor';
        this._Article     = _opts.article;
        this._QuantityChannel = _opts.quantityChannel;
        this._ChannelNames    = _opts.channelNames;
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
 * @description Класс, представляющий каждый отдельно взятый канал датчика в качестве службы фреймворка.
 */
class ClassChannelSensor extends ClassBaseService_S {
    #_ValueBuffer = {
        _depth: 1,
        _rawVal: undefined,
        _arr: [],

        push: function (_val) {
            this._rawVal = _val;
            while (this._arr.length >= this._depth) {
                this._arr.shift();
            }
            this._arr.push(_val);
        }
    };
    #_Value;
    #_MappingCompleted;
    
    #_ChType;
    #_ChAlias;
    #_ChMeas;
    #_SourceName;
    #_DeviceId;
    #_ChNum;           
    #_DeviceIdHash;
    #_Address;
    #_ChangeThreshold;

    #_DeviceInfo = null;
    #_Transform = null;
    #_Suppression = null;
    #_Filter = null;
    #_Alarms = null;

    /**
     * @typedef TypeServiceOpts
     * @property {[ClassBus_S]} _busList
     * @property {[string]} _busNameList
     */
    /**
     * @typedef TypeChOpts
     * @property {string} sourceName, 
     * @property {string} deviceId 
     * @property {number} chNum
     */
    /**
     * @constructor 
     * @param {TypeServiceOpts} _serviceOpts 
     * @param {TypeChOpts} _chOpts 
     * @param {ClassSensorInfo} _deviceInfo 
     */
    constructor({ _busList, _busNameList, _advOpts }) {
        // имя службы идентично id канала
        const service_name = `${_advOpts.SourceName}-${_advOpts.DeviceId}-${_advOpts.ChNum}`;
        super({ _name: service_name, _busNameList, _busList });

        /** Основные поля */
        this.#_Value = 0;

        this.#_SourceName = _advOpts.SourceName;
        this.#_DeviceId   = _advOpts.DeviceId;
        this.#_ChNum      = _advOpts.ChNum; 

        this.#_ChType   = _advOpts.ChType;
        this.#_ChAlias  = _advOpts.ChAlias;
        this.#_ChMeas   = _advOpts.ChMeas;
        this.#_DeviceIdHash = _advOpts.DeviceIdHash;
        this.#_Address      = _advOpts.Address;
        this.#_ChangeThreshold = 1;
        // флаги
        this._DataUpdated = false;
        this._DataWasRead = false;
        this._TimeStamp;
        // настройка функций мат.обработки
        this.SetupMathChannel(_advOpts);
        this.EnableAlarms();
        // подписка на init
        this.FillEventOnList('sysBus', [ COM_ALL_INIT1 ]);
    }

    get DeviceInfo() { return this.#_DeviceInfo; }

    get Alarms() { return this.#_Alarms; }

    get Suppression() { return this.#_Suppression; }

    get Transform() { return this.#_Transform; }

    get Filter() { return this.#_Filter; }

    /**
     * @getter
     * Возвращает уникальный идентификатор канала
     */
    get ID() { return generateHash(this.Name, '-'); }

    get NamePLC() { return `${this.#_DeviceId}-${this.#_ChNum}`}

    get SourceName() { return this.#_SourceName; }

    /**
     * @getter
     * @public
     * @description Возвращает имя канала согласно имеющейся информации об устройстве 
     */
    get ChName() { 
        const ch_names = this.#_DeviceInfo?.ChannelNames;
        return Array.isArray(ch_names) ? ch_names[this.#_ChNum] : CONST_UNKNOWN;
    }

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

    get Address() { return this.#_Address; }

    /**
     * @getter
     * Возвращает статус измерительного канала: 0 - не опрашивается, 1 - опрашивается, 2 - в переходном процессе
     */
    get Status() {
        return (this.SourcesState[this.#_SourceName]?.IsConnected && this.#_MappingCompleted) ? STATUS_ACTIVE : STATUS_INACTIVE;
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
     * Возвращает значение канала, хранящееся в основном объекте
     */
    get Value() { // вых значение канала
        if (!this.Status) return undefined;

        this._DataUpdated = false;
        if (this._DataWasRead) return this.#_Value;

        this.#_Value = this.#_Filter.FilterArray(this.#_ValueBuffer._arr);
        this._DataWasRead = true;

        return this.#_Value;
    }

    /**
     * @setter
     * Добавляет значение в буфер   
     * @param {Number} _val 
     */
    set Value(_val) {
        console.log(`${this.Name}.Value = ${_val}`);
        let val = this.#_Suppression.SuppressValue(_val);
        val = this.#_Transform.TransformValue(val);
        this.#_ValueBuffer.push(val);

        this.EmitEvents_all_data_fine_set();
        this.EmitEvents_providermdb_data_write();

        this._DataUpdated = true;
        this._DataWasRead = false;

        if (this.#_Alarms) this.#_Alarms.CheckZone(this.Value);
    }

    /**
     * @setter
     * Сеттер который устанавливает вместимость кольцевого буфера
     * @param {Number} _cap 
    */
    set AvgCapacity(_cap) {
        if (_cap > 1)
            this.#_ValueBuffer._depth = _cap;
    }

    get Protocol() { return this.SourcesState[this.SourceName].Protocol; }

    get ProtocolBusName() {
        // определение типа подключения
        return Object.values(this.ServicesState)
            .find(_service => _service.Name.toLowerCase().includes('proxy') && _service.Protocol === this.Protocol)
            .PrimaryBus;
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
     * @property {number} avgCapacity
     */
    /**
     * @method
     * @public
     * @description Конфигурирует обработку данных на канале 
     * @param {ChConfigOpts} _advOpts 
     */
    SetupMathChannel(_advOpts = {}) {
        this.#_Transform = new ClassTransform(_advOpts.transform);
        this.#_Suppression = new ClassSuppression(_advOpts.suppression);
        this.#_Filter = new ClassFilter();
        this.#_Alarms = null;
        if (_advOpts.zones) {
            this.EnableAlarms();
            this.#_Alarms.SetZones(_advOpts.zones);
        }
        this.AvgCapacity = _advOpts.avgCapacity ?? 1;
    }

    /**
     * @method
     * @public
     * @description Отправляет на dataBus сообщение со значением канала
     */
    EmitEvents_all_data_fine_set() {
        const msg = {
            dest: 'all',
            com: COM_DATA_FINE_SET,
            arg: [this.Name],
            value: [{
                Name: this.Name,
                Value: this.Value,
                ChName: this.ChName,
                ChAlias: this.ChAlias,
                ChMeas: this.ChMeas,
                CurrZone: this.Alarms?.CurrZone
            }]
        }
        this.EmitMsg('dataBus', msg.com, msg);
    }
    /**
     * @method
     * @public
     * @description Отправляет на providermdb обработанные показания канала.
     */
    EmitEvents_providermdb_data_write() { }

    /**
     * @method
     * @public
     * @description Обработчик команды на инициализацию службы
     * @param {string} _topic 
     * @param {ClassBusMsg_S} _msg 
     */
    HandlerEvents_all_init_stage1_set(_topic, _msg) {
        super.HandlerEvents_all_init_stage1_set(_topic, _msg);
        this.EmitEvents_dm_new_channel();

        this.FillEventOnList(this.ProtocolBusName, [ COM_DATA_RAW_GET, COM_DM_DEVLIST_SET, COM_ALL_DEVINFO_SET ]);
    }

    /**
     * @method
     * @public
     * @description 
     * @param {string} _topic 
     * @param {ClassBusMsg_S} _msg 
     */
    HandlerEvents_all_data_raw_get(_topic, _msg) {
        try {
            const [ source_name ] = _msg.arg;
            const [ ch_name ] = _msg.value[0].arg;
            // ВНИМАНИЕ: от lhp-источников ch_name придет в формате <device_id>-<ch_num> а не <source_name>-<device_id>-<ch_num>
            console.log(`(${ch_name} === ${this.NamePLC} || ${ch_name} === ${this.Name}) && ${source_name} === ${this.#_SourceName})`);
            if ((ch_name === this.NamePLC || ch_name === this.Name) && source_name === this.#_SourceName)
                this.Value = _msg.value[0]?.value[0];
        } catch (e) {
            this.EmitEvents_logger_log({ msg: `Error while processing data-daw msg`, level: 'E', obj: _msg });
        }
    }
    
    /**
     * @method
     * @public
     * @description Обрабатывает полученный от plc или прокси службы-источника список каналов.
     */
    HandlerEvents_dm_deviceslist_set(_topic, _msg) {
        const [ msg_lhp ] = _msg.value;
        // извлечение списка каналов
        // { sensor: [...], actuator: [...] }
        const [ sens_act_lists ] = msg_lhp.value;
        const [ source_name ] = _msg.arg;
        // ChType - всегда ключ 'sensor' | 'actuator'
        const list_includes_ch = sens_act_lists[this.#_ChType]?.find(_note => _note === this.Name || _note === this.NamePLC);
        if (list_includes_ch && source_name === this.SourceName) 
            this.#_MappingCompleted = true;
    }

    /**
     * @method
     * @public
     * @description Обрабатывает получение конфигурации устройств. 
     * @param {string} _topic 
     * @param {ClassBusMsg_S} _msg 
     */
    HandlerEvents_all_device_config_set(_topic, _msg) {
        const [ device_info_list ] = _msg.value;
        const device = device_info_list.find(_device => _device.id === this.#_DeviceIdHash);

        if (!device) {
            this.EmitEvents_logger_log({ level: 'W', msg: `DeviceInfo for ${this.#_DeviceIdHash} is not found` }); 
            return;
        }
           
        try {
            this.#_DeviceInfo = new ClassSensorInfo(device);
        } catch (e) {
            this.EmitEvents_logger_log({ level: 'E', msg: 'Failed to create DeviceInfo obj', obj: device });
        }
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

    /**
     * @method 
     * Очищает буфер. Фактически сбрасывает текущее значение канала. 
     */
    ClearBuffer() {
        while (this.#_ValueBuffer._arr.length > 0) this.#_ValueBuffer._arr.pop();
    }

    /**
     * @method
     * Метод предназначен для запуска циклического опроса определенного канала датчика с заданной периодичностью в мс. Переданное значение периода сверяется с минимально допустимым значением для данного канала и, при необходимости, корректируется, так как максимальная частота опроса зависит от характеристик датчика.
     * В датчиках, где считывание значений с нескольких каналов происходит неразрывно и одновременно, ведется только один циклический опрос, а повторный вызов метода Start() для конкретного канала лишь определяет, будет ли в процессе опроса обновляться значение данного канала.
     * Для датчиков, каналы которых не могут опрашиваться одновременно, реализация разных реакций на повторный вызов метода выполняется с помощью параметра _opts.
     * 
     * @param {Number} [_period] - период опроса в мс.
     * @param {Object} [_opts] - необязательный параметр, позволяющий передать дополнительные аргументы.
     * @returns {Boolean} 
     */
    Start(_period, _opts) {
        return this.#_DeviceInfo.Start(this.#_ChNum, _period, _opts);
    }

    /**
     * @method
     * Метод предназначен для прекращения считывания значений с заданного канала. В случаях, когда значения данного канала считываются синхронно с другими, достаточно прекратить обновление данных.
     */
    Stop() {
        return this.#_DeviceInfo.Stop(this.#_ChNum);
    }

    /**
     * @method
     * Метод предназначен для остановки опроса указанного канала и его последующего запуска с новой частотой. Возобновление должно касаться всех каналов, которые опрашивались до остановки.
     * @param {Number} _period - новый период опроса.
     */
    ChangeFreq(_period) {
        return this.#_DeviceInfo.ChangeFreq(this.#_ChNum, _period);
    }

    /**
     * @method
     * Метод предназначен для конфигурации датчика.
     * @param {Object} [_opts] - объект с конфигурационными параметрами.
     */
    Configure(_opts) {
        return this.#_DeviceInfo.Configure(this.#_ChNum, _opts);
    }

    /**
     * @method
     * Метод предназначен для предоставления дополнительных сведений об измерительном канале или физическом датчике.
     * @param {Object} _opts - параметры запроса информации.
     */
    GetInfo(_opts) {
        return this.#_DeviceInfo.GetInfo(this.#_ChNum, _opts);
    }

    /**
     * @method
     * Метод предназначен для выполнения перезагрузки датчика.
     * @param {Object} _opts - параметры перезагрузки.  
     */
    Reset(_opts) {
        return this.#_DeviceInfo.Reset(this.#_ChNum, _opts);
    }

    /**
     * @method
     * Метод предназначен для выполнения калибровки измерительного канала датчика
     * @param {Object} _opts - объект с конфигурационными параметрами
     */
    Calibrate(_opts) {
        return this.#_DeviceInfo.Calibrate(this.#_ChNum, _opts);
    }

    /**
     * @method
     * Метод предназначен для установки значения повторяемости измерений.
     * @param {Number | String} _rep - значение повторяемости.
     */
    SetRepeatability(_rep) {
        return this.#_DeviceInfo.SetRepeatability(this.#_ChNum, _rep);
    }

    /**
     * @method
     * Метод предназначен для установки точности измерений.
     * @param {Number | String} _pres - значение точности.
     */
    SetPrecision(_pres) {
        return this.#_DeviceInfo.SetPrecision(this.#_ChNum, _pres);
    }

    #GetServiceName(_id) {
        return `${_id}`;
    }
}
/**
 * @class
 * Класс реализует функционал для работы с функциями-фильтрами
 */
class ClassFilter {
    #_FilterFunc;
    constructor() {
        this.#_FilterFunc = (arr) => arr[arr.length - 1];
    }
    /**
     * @method
     * Вызывает функцию-фильтр от переданного массива
     * @param {[Number]} arr 
     * @returns 
     */
    FilterArray(arr) {
        return this.#_FilterFunc(arr);
    }

    /**
     * @method
     * Устанавливает функцию-фильтр
     * @param {Function} _func 
     * @returns 
     */
    SetFunc(_func) {
        if (!_func) {        //если _func не определен, то устанавливается функция-фильтр по-умолчанию
            this.#_FilterFunc = (arr) => arr[arr.length - 1];
            return true;
        }
        if (typeof _func !== 'function') throw new Error('Not a function');
        this.#_FilterFunc = _func;
        return true;
    }
}
/**
 * @class
 * Класс реализует функционал для обработки числовых значений по задаваемым ограничителям (лимитам) и функцией
 */
class ClassTransform {
    #_TransformFunc;
    constructor(_opts) {
        if (_opts)
            this.SetLinearFunc(_opts.k, _opts.b);
        else
            this.#_TransformFunc = (x) => x;
    }
    /**
     * @method
     * Задает функцию, которая будет трансформировать вх.значения.
     * @param {Function} _func 
     * @returns 
     */
    SetFunc(_func) {
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
     * @param {ClassChannelSensor} _channel 
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
        this._CurrZone  = val < this._Zones[indexes.redLow]  ? 'redLow'
                        : val > this._Zones[indexes.redHigh] ? 'redHigh'
                        : val < this._Zones[indexes.yelLow]  ? 'yelLow'
                        : val > this._Zones[indexes.yelHigh] ? 'yelHigh'
                        : 'green';

        if (prevZone !== this._CurrZone) {
            this._ChannelCb?.();
            this._Callbacks[indexes[this._CurrZone]](this._Channel, prevZone);
        }
    }
}

module.exports = ClassChannelSensor;

