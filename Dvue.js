/**
 * 数组改变数据内容方式有两种
 * 1. 通过索引修改内容
 *  使用vue.set方法
 * 2. 通过方法修改内容
 *  有七种改变自身内容的数组方法：push,pop,shift,unshift,splice,sort,reverse
 * 数组数据劫持的思路：
 * 1. 监听内容
 * 2. 监听方法
 */

// 获取数组的prototype
const orginalProto = Array.prototype
// 创建一个新的对象
const arrProto = Object.create(orginalProto)
// 需要拦截的方法
const interceptMethods = ['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse']

interceptMethods.forEach(method => {
    // 缓存原始方法
    const original = orginalProto[method]
    Object.defineProperty(arrProto, method, {
        value: function(...args) {
            // 完成本职工作
            const ret = original.apply(this, args)
            // 新增元素 也要进行响应式处理-数据劫持
            let inserted = []

            switch(method) {
                case 'push':
                case 'unshift':
                    inserted = args
                    break
                case 'splice':
                    // arr.splice(index, num, x,x,x)
                    inserted = args.slice(2)
                    break
                default:
                    break
            }
            inserted.length && this.__ob__.arrWalk(inserted)
            // 依赖通知更新
            this.__ob__.dep.notify()
            // 触发依赖
            return ret
        },
        configurable: true,
        writable: true,
        enumerable: true
    })
})

// 判断对象是否有__proto__这个属性
const hasProto = '__proto__' in {}
// 包含__proto__属性替换原型对象的方法
function protoAugment(target, src, keys) {
    target.__proto__ = src
}
// 不会包含__proto__属性，将带有拦截器的方法，挂在到指定对象上
function copyAugment(target, src, keys) {
    Object.keys(keys).forEach(key => {
        def(target, key, src[key])
    })
}

function def(obj, key, val, enumerable) {
    Object.defineProperty(obj, key, {
        value: val,
        configurable: true,
        writable: true,
        enumerable: !!enumerable
    })
}



// Dvue 方法
function DVue(options) {
    // 初始化变量
    const { data, el, methods } = options
    this.$data = data
    this.$el = el
    this.$methods = methods
    // 数据劫持
    observe(this.$data)
    /**
     * 代理
     * 将data中的各个属性代理到，DVue实例上
     * 支持通过this.xxx访问数据
     */
    proxy(this.$data, this)
    // 编译模版
    new Compiler(this.$el, this)
}
// proxy方法
function proxy(data, vm) {
    // 使用vm.$data原因是vm.$data会被数据劫持
    Object.keys(data).forEach(key => {
        // 代理属性
        Object.defineProperty(vm, key, {
            get() {
                return vm.$data[key]
            },
            set(newVal) {
                vm.$data[key] = newVal
            }
        })
    })
}

// 对象数据劫持方法
function definReactive(data, key ,val) {
    // 处理val是对象的情况
    const childObj = observe(val)
    //实例化依赖中心-针对key的Dep
    const dep = new Dep()
    Object.defineProperty(data, key, {
        get() {
            // 收集依赖
            if(Dep.target) {
                dep.add()
                // 针对内容收集 1.数组 2.Vue.set
                if(childObj) {
                    childObj.dep.add()
                }
            }
            // console.log(`get key: ${key}, value: ${val}`)
            return val
        },
        set(newVal) {
            // console.log(`set key: ${key}, newValue: ${newVal}`)
            if(val === newVal) return
            // 处理设置的值是对象的情况
            observe(newVal)
            val = newVal
            // 触发依赖 通知管理下的watchers 执行update方法
            dep.notify()
            
        }
    })
}
// observe方法
// 判断是否是对象
function observe(obj) {
    if(obj === null || typeof obj !== 'object') return
    // 如果 value.__ob__ 属性已经存在，说明 value 对象已经具备响应式能力，直接返回已有的响应式对象
    if (obj.__ob__) return obj.__ob__
    return new Observer(obj)
}
// Observe方法
function Observer(obj) {
    // 为对象本身设置一个 dep，方便在更新对象本身时使用，比如 数组通知依赖更新时就会用到
    this.dep = new Dep()
    Object.defineProperty(obj, '__ob__', {
        value: this,
        enumerable: false,
        writable: true,
        configurable: true
      })
    if(Array.isArray(obj)) {
        // 拦截方法
        const augment = hasProto ? protoAugment : copyAugment
        augment(obj, arrProto, interceptMethods)
        this.arrWalk(obj)
    }else {
        this.walk(obj)
    }
}
// 对象每一个属性进行劫持
Observer.prototype.walk = function(obj) {
    Object.keys(obj).forEach(key => {
        definReactive(obj, key, obj[key])
    })
}

// 数组每一个值进行劫持
Observer.prototype.arrWalk = function(obj) {
    Object.keys(obj).forEach(key => {
        observe(obj[key])
    })
}

//依赖管理
function Dep() {
    this.watchers=[]
}

// 设置静态值
// Dep.target 是一个静态属性，值为 null 或者 watcher 实例
// 在Watcher 实例化的时候赋值， 待依赖收集结束之后，再重新赋值为null
Dep.target = null

// 添加依赖
Dep.prototype.add = function() {
    if(this.watchers.includes(Dep.target)) return
    this.watchers.push(Dep.target)
}
// 通知依赖
Dep.prototype.notify = function() {
    for(let watcher of this.watchers) {
        watcher.update()
    }
}

// Watcher方法
// cb 回调函数 负责 更新dom
function Watcher(vm, key, cb) {
    this.vm = vm
    this.key = key
    // 初始化时给Dep.target赋值
    // 备份cb
    this._cb = cb
    Dep.target = this
    // 属性的读取，进行依赖收集
    this.vm[key]
    Dep.target = null
}

// 更新操作
Watcher.prototype.update = function() {
    this._cb.call(this.vm, this.vm[this.key])
}

// 编译方法
function Compiler(el, vm) {
    // 初始化
    this.$vm = vm
    this.$el = document.querySelector(el)
    if(this.$el) {
        this.compile(this.$el)
    }
}

Compiler.prototype.compile = function(el) {
    const childNodes = el.childNodes
    childNodes.forEach(node => {
        if(this.isElement(node)) {
            // 判断是否是元素节点
            if(node.childNodes.length>0) {
                // 判断是否还有子节点
                this.compile(node)
            }
            this.compileElement(node)
        } else if(this.isInertText(node)) {
        // 差值文本节点
            this.compileText(node)
        }
    })
}
// 编译元素节点
Compiler.prototype.compileElement = function(node) {
    // 需要获取v-bind 和 v-on 和 v-model
    const attrs = node.attributes
    Array.from(attrs).forEach(attr => {
        const attrName = attr.name
        const exp = attr.value
        if (this.isEvent(attrName)) {
            //方法
            let dir = ''
            if(attrName.includes('v-on:')) {
                dir = attrName.substring(5)
            }else if (attrName.includes('@')) {
                dir = attrName.substring(1)
            }
            this.eventHandler(node, exp, dir);

        } else if (this.isDir(attrName)) {
            //指令
            // v-bind: :
            if(attrName.includes(':')) {
                const dir = attrName.split(':')[1]
                this.compileVBind(node, exp, dir, attrName)
                // console.log(dir)
            }else {
                // v-model v-text
                const dir = attrName.substring(2)
                this[dir] && this[dir](node, exp, dir)
            }

        }
    })
}
// 编译带有{{}}文本节点
Compiler.prototype.compileText = function(node) {
    this.update(node, RegExp.$1, 'text')
}
// 编译带有v-text节点
Compiler.prototype.text = function(node, exp, dir) {
    this.update(node, exp, dir)
}
// 更新文本节点
Compiler.prototype.textUpdater = function(node, val) {
    node.textContent = val
}
// 编译带有v-model节点
Compiler.prototype.model = function(node, exp, dir) {
    this.update(node, exp, dir)
    node.addEventListener('input', (e) => {
        this.$vm[exp] = e.target.value
    })
}
// 更新
Compiler.prototype.modelUpdater = function(node, val) {
    node.value = val
}
// 编译带有v-html节点
Compiler.prototype.html = function(node, exp, dir) {
    this.update(node, exp, dir)
}
// 更新
Compiler.prototype.htmlUpdater = function(node, val) {
    node.innerHTML = val
}

// 编译属性
Compiler.prototype.compileVBind = function(node, exp, dir, attrName) {
    console.log(node, exp, dir, attrName)
    // 移除v-bind属性
    node.removeAttribute(attrName)
    this.update(node, exp, 'bind', dir)
}
Compiler.prototype.bindUpdater = function(node, val, attr) {
    node.setAttribute(attr, val)
}


// 更新函数
Compiler.prototype.update = function(node, exp, dir, attr) {
    // 初始化
    const fn = this[`${dir}Updater`]
    fn&&fn(node, this.$vm[exp], attr)
    // 创建watcher
    new Watcher(this.$vm, exp,  val => {
        fn && fn(node, val, attr)
    })
}

//方法调用
Compiler.prototype.eventHandler = function(node, exp, dir) {
    const fn = this.$vm.$methods && this.$vm.$methods[exp]
    if(fn) {
        node.addEventListener(dir, fn.bind(this.$vm))
    }
}

// 判断节点是不是元素节点
Compiler.prototype.isElement = function(node) {
    return node.nodeType === 1
}
// 判断是不是差值文本节点
Compiler.prototype.isInertText= function(node) {
    return node.nodeType === 3 && /{{(.*)}}/.test(node.textContent)
}
// 判断指令
Compiler.prototype.isDir = function(attrName) {
    return attrName.startsWith('v-') || attrName.startsWith(':')
}
// 判断方法
Compiler.prototype.isEvent = function(attrName) {
    return attrName.startsWith('v-on:') || attrName.startsWith('@')
}