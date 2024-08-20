const BusMsg = require('BusMsg');

const REQ_DEFAULT_TIMEOUT = 3000; 
/**
 * @class
 * Обобщенный класс интерфейса. Предоставляет функционал для унифицированной работы с шинами, включая создание запросов с асинхронным ответом.
 */
class ClassHrzInterface_S {
    /**
     * @constructor
     * @param {string} _serviceName - имя службы, использующей интерфейс
     * @param {[EventEmitter]} _buses - коллекция шин; любая шина наследуется от EventEmitter 
     */
    constructor(_serviceName, _buses) {
        this._ServiceName = _serviceName;
        this._Buses = _buses;
    }
    /**
     * @method
     * Добавляет функцию-обработчик для события
     * @param {string} com
     * @param {func} func 
     */
	AddHandler(com, func) { 
		/*в качестве обработчика устанавливается функция, которая вызывает переданную пользователем
          это позволяет 
            контролировать условия вызова функции, 
            подменять и проверять переданные в неё аргументы 
            и тд
        */
        this.on(com, (...args) => {     
            if (this.Active)         
                return func(...args);
        });
	}
    /**
     * @method
     * @description 
     * Отправляет сообщение на шину
     * @param {string} _busName - имя шины, на которую отправляется сообщение
     * @param {BusMsg}  _msg - само сообщение
     * @param {boolean} _req - поддерживает ли запрос получение ответа
     * @param {number}  _timeout - время в мс через которое ожидание ответа завершится с ответом undefined
     * @returns 
     */
	async Send(_busName, _msg, _req = false, _timeout = REQ_DEFAULT_TIMEOUT) {
        // TODO: проверка что шина с таким именем существует
        let bus = this._Buses.find(b => b.Name === _busName);
        let msg = null;
        try {
            // преобразование объекта сообщения
            msg = new BusMsg({..._msg, source: this._ServiceName });
        } catch { 
            return false; 
        }
        bus.emit(msg.topic, msg.payload);
        // если метод вызван с флагом запроса 
        if (_req) {
            return new Promise((resolve, reject) => {
                // одноразовая подписка на сообщение с именем hash направляемого запроса 
                bus.once(`${msg.topic}-${msg.hash}`, (response) => resolve(response.value));
                // взведение таймаута по которому будет вызван reject
                // TODO: продумать нужен ли reject из функции       // setTimeout(() => reject(`Timeout error`), _timeout);
                setTimeout(() => resolve(undefined), _timeout);
            });
        }
	}
}

module.exports = ClassHrzInterface_S;