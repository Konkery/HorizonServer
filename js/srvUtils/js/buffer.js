class ClassValueBuffer {
    constructor(_opts, _ch) {
        let opts = _opts ?? {};
        this._depth = (typeof opts.size === 'number' && opts.size > 0) ? opts.size : 1;
        this._rawVal = undefined;
        
        this._arr = new Array(this._depth);
        this._head = 0;  // Индекс для записи следующего элемента
        this._count = 0; // Текущее количество элементов в буфере

        let filterFunc = arr => arr.reduce((acc, val) => val ? acc + Number(val) : acc, 0) / arr.length;
            
        this.SetFilterFunc(filterFunc);
    }

    set Size(_cap) {
        if (typeof _cap === 'number' && _cap >= 1) {
            this._depth = _cap;
            this.Clear();
        }
    }

    Clear() {
        this._head = 0;
        this._count = 0;
    }

    /**
     * @method
     * Возвращает массив в правильном хронологическом порядке (от старых к новым)
     */
    GetOrderedArray() {
        if (this._count === 0) return [];
        
        if (this._count < this._depth) {
            return this._arr.slice(0, this._count); 
        }
        
        // Если буфер заполнен, склеиваем "хвост" и "голову"
        // Это O(n), но выполняется только в момент вызова фильтра, а не при каждом push()
        return this._arr.slice(this._head).concat(this._arr.slice(0, this._head));
    }

    Filter() {
        return this._FilterFunc(this.GetOrderedArray());
    }

    SetFilterFunc(_func) {
        if (!_func) {
            this._FilterFunc = (arr) => arr[arr.length - 1];
            return true;
        }
        if (typeof _func !== 'function') throw new Error('Not a function');
        this._FilterFunc = _func;
        return true;
    }

    ToConfig() {
        return { size: this._depth };
    }

    push(_val) {
        if (typeof _val != 'number') return;
        this._rawVal = _val;
        this._arr[this._head] = _val;
    
        // Сдвигаем указатель по кругу
        this._head = (this._head + 1) % this._depth;

        if (this._count < this._depth) {
            this._count++;
        }
    }
}

module.exports = ClassValueBuffer;

/*
let buf = new ClassValueBuffer({ size: 4 });
console.log(buf.Filter());  // 0
buf.push(1);
console.log(buf.Filter());  // 1
buf.push(2);
console.log(buf.Filter());  // 3
buf.push(3);                
console.log(buf.Filter());  // 6
buf.push(4);                
console.log(buf.Filter());  // 10
buf.push(5);                
console.log(buf.Filter());  // 14
console.log(buf._arr);      // [5, 2, 3, 4]
console.log(buf.GetOrderedArray()); // [2, 3, 4, 5]
*/