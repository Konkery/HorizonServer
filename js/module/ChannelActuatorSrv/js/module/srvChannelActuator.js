/**
 * @typedef SensorOptsType 
 * @property {String} name
 * @property {String} article
 * @property {String} moduleName
 * @property {String} type
 * @property {[String]} channelNames
 */

const { register } = require('module');
const ClassBaseService_S = require('./srvService');
/**
 * @class 
 * Самый "старший" предок в иерархии классов датчиков. 
 * В первую очередь собирает в себе самые базовые данные о датчике: переданные шину, пины и тд. Так же сохраняет его описательную характеристику: имя, тип вх. и вых. сигналов, типы шин которые можно использовать, количество каналов и тд.
 */
class ClassActuatorInfo {
    /**
     * @constructor
     * @param {SensorOptsType} _opts - объект с описательными характеристиками датчика и параметрами, необходимых для обеспечения работы датчика
     */
    constructor(_opts) { 
        this._Name         = _opts.name; 
        this._Article      = _opts.article;
        this._ModuleName   = _opts.moduleName;
        this._Type         = _opts.type;
        this._ChannelNames = _opts.channelNames;

        this.CheckProps();
    }
    get Name() { return this._Name; }
    get Article() { return this._Article; }
    /**
     * @method
     * Метод проверяет корректность полей объекта
     */
    CheckProps() {
        //#region функции которые можно вынести в утилитарный класс
        const isStringNonEmpty = (p) => typeof p === 'string' && p.length > 0;
        const isNumberPositive = (p) => typeof p === 'number' && p > 0;
        //#endregion

        if (!isStringNonEmpty(this._IdSource))          throw new Error(`Invalid _IdSource`);
        if (!isStringNonEmpty(this._Article))           throw new Error(`Invalid _Article`);
        if (!isStringNonEmpty(this._Name))              throw new Error(`Invalid _Name`);
        if (!isStringNonEmpty(this._Type))              throw new Error(`Invalid _Type`);
        if (!isNumberPositive(this._QuantityChannel))   throw new Error(`Invalid _QuantityChannel`);
    }
}

/**
 * @class
 * Класс, представляющий каждый отдельно взятый канал датчика.
 */
class ClassChannelActuator extends ClassBaseService_S {
    #_SourceBus;
    #_Value;
    #_Status;
    #_SourceId;
    #_DeviceId;
    #_ChNum;           //номер канала (начиная с 0)
    #_ChangeThreshold;
    #_Tasks = { };
    #_SourcesState;

    #_DeviceInfo = null;
    #_Transform   = null;
    #_Suppression = null;
    #_Filter = null;
    #_Alarms = null;
    /**
     * @constructor
     * @param {ClassActuatorInfo} _sensorInfo - ссылка на основной объект датчика
     * @param {Number} num - номер канала
     */
    constructor({ _busList, _busNameList, _id, _deviceInfo, _config }) {
        super({ _name: _id, _busNameList, _busList });
        const [sourceId, deviceId, chNum] = _id.split('-');

        this.#_DeviceInfo = _deviceInfo;      //ссылка на объект физического датчика
        /** Основные поля */
        // TODO: обновление status по событиям
        this.#_Status = 0;
        this.#_SourceId = sourceId;
        this.#_DeviceId = deviceId;
        this.#_ChNum    = +chNum;             //номер канала (начиная с 0)

        /****** */
        this.SetupConfig(_config);
        // получение имени шины, которая связывает канал с источником
        this.#_SourceBus = Object.values(_busList).find(_bus => 
            _bus.Name !=='sysBus' && _bus.Name !== 'logBus' && _bus.Name !== 'dataBus');
    }
    get Info()        { return this.#_DeviceInfo; }

    get Alarms()      { return this.#_Alarms; }

    get Suppression() { return this.#_Suppression; }

    get Transform()   { return this.#_Transform; }

    get Filter()      { return this.#_Filter; }

    static GetID(_sourceId, _deviceId, _chNum) { return `${_sourceId}-${_deviceId}-${('0'+_chNum).slice(-2)}`; }    
    /**
     * @getter
     * Возвращает уникальный идентификатор канала
     */
    get ID() { return ClassChannelActuator.GetID(this.#_SourceId, this.#_DeviceId, this.#_ChNum); }

    get SourceID() { return this.#_SourceId; }
    
    /**
     * @getter
     * Возвращает статус измерительного канала: 0 - не опрашивается, 1 - опрашивается, 2 - в переходном процессе
     */
    get Status() {
        // return this._Sensor._ChStatus[this.#_ChNum];
        return this.#_Status;
    }
    set Status(_s) {
        if (typeof _s == 'number') this.#_Status = _s;
    }
    /**
     * @getter
     * Возвращает установленный для канала порог изменения - процент, на который должно измениться Value чтобы SM считал его новым.
     */
    get ChangeThreshold () { 
        return this.#_ChangeThreshold; 
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
     * @property {object} transform
     * @property {object} suppression
     * @property {object} zones
     */
    /**
     * @method
     * @public
     * @description Конфигурирует обработку данных на канале 
     * @param {ChConfigOpts} _config 
     */
    SetupConfig(_config={}) {
        this.#_Transform   = new ClassTransform(_config.transform);
        this.#_Suppression = new ClassSuppression(_config.suppression);
        this.#_Alarms = null;
        if (_config.zones) {
            this.EnableAlarms();
            this.#_Alarms.SetZones(_config.zones);
        }
    }
    /**
     * @method
     * Инициализирует ClassAlarms в полях объекта.  
     */ 
    EnableAlarms() {
        this.#_Alarms = new ClassAlarms(this);
    }
    /**
     * @method
     * Возвращает активный в данный момент таск либо null
     * @returns {ClassTask}
     */
    get ActiveTask() {
        for (let key in this.#_Tasks) {
            if (this.#_Tasks[key]._IsActive) return this.#_Tasks[key];
        }
        return null;
    }
    /**
     * @method
     * Устанавливает базовые таски актутора
     */
    InitTasks() {
        return this._Actuator.InitTasks(this._ChNum);
    }
    /**
     * @method
     * Метод обязывает запустить работу актуатора
     * @param {Number} _freq
     * @returns {Boolean} 
     */
    On(_val, _opts) {
        let val = this._Suppression.SuppressValue(_val);
        val = this._Transform.TransformValue(val);

        if (this.#_Alarms) this.#_Alarms.CheckZone(val);

        const msg_to_plc = {
            com:   'dm-actuator-set',
            arg:   [this.ID.split('-').slice(1).join('-')],
            value: [val],
            dest: 'dm'
        }
        // определение типа подключения
        const source_type = this.#_SourcesState.find(_source => _source.Name === this.SourceID); 
        // выбор команды proxywsc-send | proxymqtt-send | ...
        const com_send = source_type == 'hlp' ? 'proxywsc-send' : `proxy${source_type}-send`;
        const msg = {
            dest: com_send.split('-')[0],
            com: com_send,
            arg: [this.SourceID],
            value: [msg_to_plc]
        }
        
        this.EmitMsg(this.#_SourceBus.Name, com_send, msg);
    }
    /**
     * @method
     * Метод прекращает работу канала актуатора.
     */
    Off(_opts) { }
    /**
     * @method
     * Выполняет перезагрузку актуатора
     */
    Reset(_opts) { }
    /**
     * @method
     * Метод предназначен для выполнения конфигурации актуатора
     * @param {Object} _opts - объект с конфигурационными параметрами
     */
    Configure(_opts) { }
    /**
     * @method
     * Добавляет новый таск и создает геттер на него 
     * @param {string} _name - имя таска
     * @param {Function} func - функция-таск
     */
    AddTask(_name, _func) {
        if (typeof _name !== 'string' || typeof _func !== 'function') throw new Error('Invalid arg');

        this.#_Tasks[_name] = new ClassTask(this, _func);
    }
    /**
     * @method
     * Удаляет таск из коллекции по его имени
     * @param {String} _name 
     * @returns {Boolean} 
     */
    RemoveTask(_name) {
        return delete this.#_Tasks[_name];
    }
    /**
     * @method
     * Запускает таск по его имени с передачей аргументов.
     * @param {String} _name - идентификатор таска
     * @param {...any} _args - аргументы, которые передаются в таск.
     * Примечание! аргументы передаются в метод напрямую (НЕ как массив)  
     * @returns {Boolean}
     */
    RunTask(_name, _arg1, _arg2) {
        if (!this.#_Tasks[_name]) return false;
        let args = [].slice.call(arguments, 1);
        return this.#_Tasks[_name].Invoke(args);
    }
    /**
     * @method
     * Устанавливает текущий активный таск как выполненный.
     * @param {Number} _code 
     */
    ResolveTask(_code) {
        this.ActiveTask.Resolve(_code || 0);
    }
    /**
     * @method
     * Прерывает выполнение текущего таска. 
     * 
     * Примечание: не рекомендуется к использованию при штатной работе, так как не влияет на работу актуатора, а только изменяет состояние системных флагов
     * @returns {Boolean}
     */
    CancelTask() {
        if (!this.ActiveTask) return false;

        this.ActiveTask.Resolve();
        this.Off();
        return true;
    }
    /**
     * @method
     * Метод предназначен для предоставления дополнительных сведений об измерительном канале или физическом датчике.
     * @param {Object} _opts - параметры запроса информации.
     */
    GetInfo(_opts) { 
        return this.#_DeviceInfo.GetInfo(this.#_ChNum, _opts); 
    }

    #GetServiceName(_id) {
        return `${_id}`;
    }

    HandlerEvents_all_init1(_topic, _msg) {
        super.HandlerEvents_all_init1(_topic, _msg);
        const { SourcesState } = _msg.arg[0];
        this.#_SourcesState = SourcesState;
    }
}

/**
 * @class
 * Представляет собой таск актуатора - обертку над прикладной функцией
 */
class ClassTask {
    /**
     * @constructor
     * @param {ClassChannelActuator} _channel - объект канала актуатора
     * @param {Function} _func - функция, реализующая прикладную
     */
    constructor(_channel, _func) {                          //сохранение объекта таска в поле _Tasks по имени
        this.name = 'ClassTask';
        this._Channel = _channel;
        this._IsActive = false;

        this._Func = _func.bind(this._Channel);
    }
    get IsActive() { return this._IsActive; }
    /**
     * @method
     * Запускает выполнение таска
     */
    Invoke(args) {
        let promisified = new Promise((res, rej) => {       //над переданной функцией инициализируется промис-обертка, колбэки resolve()/reject() которого должны быть вызваны при завершении выполнения таска

            this.resolve = res;
            this.reject = rej;

            if (this._Channel.ActiveTask) return this.Reject(-1);      //если уже запущен хотя бы один таск, вызов очередного отклоняется с кодом -1

            this._IsActive = true;

            return this._Func.apply(this._Channel, args);                   //вызов функции, выполняемой в контексте объекта-канала
        });
        return promisified;
    }
    /**
     * @method
     * Закрывает промис-обертку вызовом его колбэка resolve() с передачей числового кода (по умолчанию 0)
     * @param {Number} _code - код завершения
     */
    Resolve(_code) {
        this._IsActive = false;
        return this.resolve(_code || 0);
    }
    /**
     * @method
     * Закрывает промис-обертку вызовом его колбэка reject() с передачей числового кода (по умолчанию 0)
     * @param {Number} _code - код завершения
     */
    Reject(_code) {
        this._IsActive = false;
        return this.reject(_code || -1);
    }
}
/**
 * @class
 * Класс реализует функционал для работы с функциями-фильтрами
 */
class ClassFilter {
    #_FilterFunc;
    constructor() {
        this.#_FilterFunc = (arr) => arr[arr.length-1];
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
            this.#_FilterFunc = (arr) => arr[arr.length-1];
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
        this.#_TransformFunc= _func;
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
             : _val < this._Low  ? this._Low
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
     * @param {ClassChannelActuator} _channel 
     */
    constructor(_channel) {
        this._Channel = _channel;   // ссылка на объект сенсора
        this.SetDefault();
    }
    /**
     * @method
     * Устанавливает значения полей класса по-умолчанию
     */
    SetDefault() {
        this._Zones = [];
        this._Callbacks = new Array(5).fill((ch, z) => {});
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
            this._Zones[indexes.yelLow]  = _opts.yellow.low;
            this._Zones[indexes.yelHigh] = _opts.yellow.high;
            this.SetCallback(indexes.yelLow,  _opts.yellow.cbLow);     
            this.SetCallback(indexes.yelHigh, _opts.yellow.cbHigh);
        }
        if (_opts.red) {
            this._Zones[indexes.redLow]  = _opts.red.low;
            this._Zones[indexes.redHigh] = _opts.red.high;
            this.SetCallback(indexes.redLow,  _opts.red.cbLow);
            this.SetCallback(indexes.redHigh, _opts.red.cbHigh);
        }
        if (_opts.green) {
            this.SetCallback(indexes.green, _opts.green.cb);
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
            if (yellow.low >= yellow.high ||                            //если нижняя граница выше верхней
                yellow.cbLow  && typeof yellow.cbLow !== 'function' ||   //коллбэк передан но не является функцией
                yellow.cbHigh && typeof yellow.cbHigh !== 'function') return false;

            if (opts.red) {                         //если переданы настройки красной зоны, сравниваем с ними
                if (yellow.low < red.low || yellow.high > red.high) 
                    return false;
            }                                       //иначе сравниваем с текущими значениями
            else if (yellow.low < this._Zones[indexes.redLow] || yellow.high > this._Zones[indexes.redHigh]) 
                return false;
        }
        if (red) {
            if (red.low >= red.high ||                                  //если нижняя граница выше верхней
                red.cbLow  && typeof red.cbLow !== 'function' ||         //коллбэк передан но не является функцией
                red.cbHigh && typeof red.cbHigh !== 'function') return false;

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
        this._CurrZone = val < this._Zones[indexes.redLow]  ? 'redLow'
                       : val > this._Zones[indexes.redHigh] ? 'redHigh'
                       : val < this._Zones[indexes.yelLow]  ? 'yelLow'
                       : val > this._Zones[indexes.yelHigh] ? 'yelHigh'
                       : 'green';

        if (prevZone !== this._CurrZone) {
            this._Callbacks[indexes[this._CurrZone]](this._Channel, prevZone);
        }
    }
}

module.exports = { ClassChannelSensor: ClassChannelActuator, ClassSensorInfo: ClassActuatorInfo };

