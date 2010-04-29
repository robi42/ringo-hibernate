/**
 * @fileoverview Storage module for using Hibernate as ORM/persistence layer.
 */

include('ringo/engine');
include('ringo/functional');
var {Restrictions, Order} = org.hibernate.criterion;

addHostObject(org.ringojs.wrappers.Storable);
export('defineClass',
       'setHbmXmlDir',
       'withSession');

module.shared = true;
var registry = {};
var self = this;
var log = require('ringo/logging').getLogger(module.id);
var isConfigured = false;
var hbmXmlDir, config, sessionFactory, currentSession;
const HBM_DOC_HEADER = '<?xml version="1.0" encoding="UTF-8"?>' +
        '<!DOCTYPE hibernate-mapping PUBLIC ' +
        '"-//Hibernate/Hibernate Mapping DTD 3.0//EN" ' +
        '"http://hibernate.sourceforge.net/hibernate-mapping-3.0.dtd">';
var hbmDocTemplate = function(entityName, table) // E4X closure templating.
        <hibernate-mapping>
            <class entity-name={entityName} table={table}/>
        </hibernate-mapping>;
var hbmPropTemplate = function(name, column, type)
        <property name={name} column={column} type={type}/>;
const EQUAL =                 Restrictions.eq;
const GREATER_THAN =          Restrictions.gt;
const GREATER_THAN_OR_EQUAL = Restrictions.ge;
const LESS_THAN =             Restrictions.lt;
const LESS_THAN_OR_EQUAL =    Restrictions.le;
const ORDER_BY_ASC =          Order.asc;
const ORDER_BY_DESC =         Order.desc;

function defineClass(type, mapping) {
    var ctor = registry[type];
    if (!ctor) {
        ctor = registry[type] = Storable.defineClass(self, type, mapping);
        ctor.all = bindArguments(all, type);
        ctor.get = bindArguments(get, type);
        ctor.query = bindArguments(query, type);
    }
    return ctor;
}

/**
 * Do something within a Hibernate session transaction.
 *
 * @param {Function} func the stuff to do w/ session
 * @returns result
 */
function withSession(func) {
    var session, transaction, result;
    try {
        session = getSession();
        transaction = session.beginTransaction();
        result = func(session);
        session.flush();
        transaction.commit();
    } catch (error) {
        abortTransaction(transaction, error);
    } finally {
        session.close();
    }
    return result;
}

/**
 * Begins a Hibernate session transaction.
 *
 * @param session the Hibernate session
 */
function beginTransaction(session) {
    transactionTemplate(session, function () {
        return session.beginTransaction();
    });
}

/**
 * Commits a Hibernate session transaction.
 *
 * @param session the Hibernate session
 */
function commitTransaction(session) {
    transactionTemplate(session, function () {
        var transaction = session.transaction;
        session.flush();
        transaction.commit();
        session.close();
        return transaction;
    });
}

/**
 * Handles errors in transactions.
 *
 * @param transaction the transaction to handle
 * @param error the error in transaction
 */
function abortTransaction(transaction, error) {
    if (transaction && transaction.isActive()) {
        transaction.rollback(); // Rollback if something went wrong.
    }
    log.error('Problem occurred within Hibernate DB session transaction.');
    throw error;
}

/**
 * Template for transactions (boilerplate code).
 *
 * @param session the Hibernate session
 * @param {Function} func the stuff to do w/ transaction
 */
function transactionTemplate(session, func) {
    var transaction;
    try {
        transaction = func();
    } catch (error) {
        abortTransaction(transaction, error);
        if (session && session.isOpen()) {
            session.close();
        }
    }
}

/**
 * Gets a Hibernate DB session.
 *
 * @returns session
 */
function getSession() {
    if (!isConfigured) {
        configure();
    }
    return sessionFactory.openSession();
}


/**
 * Enables one to optionally set path to dir from where to read *.hbm.xml.
 *
 * @param {String} path the path of XML HBMs directory
 */
function setHbmXmlDir(path) {
    hbmXmlDir = path;
}

/**
 * Configures Hibernate.
 */
function configure() {
    try {
        config = new org.hibernate.cfg.Configuration();
        handleMappings(config);
        if (hbmXmlDir) {
            config.addDirectory(new java.io.File(hbmXmlDir));
        } // Use dynamic-map entity persistence mode.
        config.setProperty('hibernate.default_entity_mode', 'dynamic-map').
                // Transactions are handled by JDBC, no JTA is used.
                setProperty('hibernate.transaction.factory_class',
                        'org.hibernate.transaction.JDBCTransactionFactory').
                // Enable session binding to managed context.
                setProperty('hibernate.current_session_context_class',
                        'thread').
                // Enable query cache.
                setProperty('hibernate.cache.use_query_cache', 'true').
                // Use easy hibernate (eh)cache.
                setProperty('hibernate.cache.provider_class',
                        'net.sf.ehcache.hibernate.SingletonEhCacheProvider').
                // Use c3p0 connection pooling.
                setProperty('hibernate.connection.provider_class',
                        'org.hibernate.connection.C3P0ConnectionProvider');
        sessionFactory = config.buildSessionFactory();
        isConfigured = true;
    } catch (error) {
        log.error('Something went wrong during Hibernate config.');
        throw error;
    }
}

/**
 * Handles mappings via `defineClass` & co.
 *
 * @params config the Hibernate configuration
 */
function handleMappings(config) {
    for (let entityName in registry) {
        if (registry[entityName].mapping) {
            var {mapping} = registry[entityName];
            var {properties: props, table} = mapping;
            var hbmDoc = hbmDocTemplate(entityName, typeof table === 'string' ?
                    table : entityName);
            if (mapping.cacheable !== false) {
                hbmDoc['class'].cache = <cache usage="read-write"/>;
            } else {
                delete hbmDoc['class'].cache;
            }
            hbmDoc['class'].id = <id name="id" column="id" type="long">
                        <generator class="native"/>
                    </id>;
            for (let propName in props) {
                var hbmProp = hbmPropTemplate(propName,
                        typeof props[propName].column === 'string' ?
                        props[propName].column : propName,
                        props[propName].type);
                if (props[propName].nullable === false) {
                    hbmProp.@['not-null'] = 'true';
                } else {
                    delete hbmProp.@['not-null'];
                }
                if (props[propName].unique === true) {
                    hbmProp.@unique = 'true';
                } else {
                    delete hbmProp.@unique;
                }
                hbmDoc['class'].appendChild(hbmProp);
            }
            log.debug('Mapping XML:\n', hbmDoc);
            config.addXML(HBM_DOC_HEADER + hbmDoc);
        }
    }
}

function create(type, key, entity) {
    var ctor = registry[type];
    var instance = ctor.createInstance(key, entity);
    instance.$type$ = type;
    return instance;
}

function convertJsValueToJava(value) {
    if (value instanceof Date) {
        return new java.util.Date(value.getTime());
    } else if (typeof value === 'number') {
        return new java.lang.Integer(value);
    }
    return value;
}

function evaluateQuery(query, property) {
    var result = [];
    var type = query.entityOrClassName;
    query.cacheable = true;
    var list = new ScriptableList(query.list());
    for each (let item in list) {
        var entity = create(type, [type, item.id], item);
        result.push(property ? entity[property] : entity);
    }
    commitTransaction(currentSession);
    return result;
}

function BaseQuery(type) {
    this.select = function (property) {
        return evaluateQuery(this.getQuery(), property);
    };
    this.getQuery = function () {
        currentSession = getSession();
        beginTransaction(currentSession);
        return currentSession.createCriteria(type);
    };
}

function OperatorQuery(parentQuery, operator, property, value) {
    this.select = function (selectProperty) {
        return evaluateQuery(this.getQuery(), selectProperty);
    };
    this.getQuery = function () {
        var query = parentQuery.getQuery();
        return query.add(operator(property, value));
    };
}

function SortQuery(parentQuery, order, property) {
    this.select = function (selectProperty) {
        return evaluateQuery(this.getQuery(), selectProperty);
    };
    this.getQuery = function () {
        var query = parentQuery.getQuery();
        return query.addOrder(order(property));
    };
}

function SliceQuery(parentQuery, limit, offset) {
    this.select = function (selectProperty) {
        return evaluateQuery(this.getQuery(), selectProperty);
    };
    this.getQuery = function () {
        var query = parentQuery.getQuery();
        if (typeof limit === 'number') {
            query.setMaxResults(new java.lang.Integer(limit));
        }
        if (typeof offset === 'number') {
            if (offset < 0) {
                throw new Error("Offset value mustn't be below zero.");
            } else {
                query.setFirstResult(new java.lang.Integer(offset));
            }
        }
        return query;
    };
}

BaseQuery.prototype.equals = function (property, value) {
    value = convertJsValueToJava(value);
    return new OperatorQuery(this, EQUAL, property, value);
};

BaseQuery.prototype.greater = function (property, value) {
    value = convertJsValueToJava(value);
    return new OperatorQuery(this, GREATER_THAN, property, value);
};

BaseQuery.prototype.greaterEquals = function (property, value) {
    value = convertJsValueToJava(value);
    return new OperatorQuery(this, GREATER_THAN_OR_EQUAL, property, value);
};

BaseQuery.prototype.less = function (property, value) {
    value = convertJsValueToJava(value);
    return new OperatorQuery(this, LESS_THAN, property, value);
};

BaseQuery.prototype.lessEquals = function (property, value) {
    value = convertJsValueToJava(value);
    return new OperatorQuery(this, LESS_THAN_OR_EQUAL, property, value);
};

BaseQuery.prototype.orderBy = function (expression) {
    return /^\w+\sdesc(ending)?$/i.test(expression) ?
            new SortQuery(this, ORDER_BY_DESC, expression.split(' ')[0]) :
            new SortQuery(this, ORDER_BY_ASC, expression);
};

BaseQuery.prototype.limit = function (value) {
    return new SliceQuery(this, value);
};

BaseQuery.prototype.offset = function (value) {
    return new SliceQuery(this, null, value);
};

BaseQuery.prototype.range = function (from, to) {
    return new SliceQuery(this, to - from + 1, from);
};

BaseQuery.prototype.clone(OperatorQuery.prototype);
BaseQuery.prototype.clone(SortQuery.prototype);
BaseQuery.prototype.clone(SliceQuery.prototype);

function query(type) {
    return new BaseQuery(type);
}

function all(type) {
    return query(type).select();
}

function get(type, id) {
    return withSession(function (session) {
        var result = session.get(type, new java.lang.Long(id));
        if (result != null) {
            var entity = new ScriptableMap(result);
            result = create(type, [type, entity.id], entity);
        }
        return result;
    });
}

function save(props, entity, entities) {
    if (entities && entities.contains(entity)) {
        return;
    }
    var isRoot = false;
    var session = getSession();
    if (!entities) {
        isRoot = true;
        entities = new java.util.HashSet();
        beginTransaction(session);
    }
    entities.add(entity);
    for (let i in props) {
        var value = props[i];
        if (isStorable(value)) {
            value.save(entities);
            value = value._key;
        } else if (value instanceof Array) {
            var list = new java.util.ArrayList();
            value.forEach(function (obj) {
                if (obj instanceof Storable) {
                    obj.save(entities);
                    list.add(obj._key);
                } else {
                    list.add(obj);
                }
            });
            value = list;
        }
        value = convertJsValueToJava(value);
        entity[i] = value;
    }
    if (isRoot) {
        for each (let obj in entities.toArray()) {
            session['saveOrUpdate(java.lang.String,java.lang.Object)'](
                    obj.$type$, obj);
        }
    }
    commitTransaction(session);
}

function remove(key) {
    withSession(function (session) {
        var obj = session.get(key[0], new java.lang.Long(getId(key)));
        if (obj != null) {
            session['delete'](obj);
        }
    });
}

function getProperties(store, entity) {
    var props = {};
    var map = new ScriptableMap(entity);
    for (let i in map) {
        // Don't copy type and id, not supposed to be editable props.
        if (i != '$type$' && i != 'id') {
            var value = map[i];
            if (value instanceof java.util.Set) {
                var array = [];
                for (let it = value.iterator(); it.hasNext(); ) {
                    let obj = it.next();
                    array.push(create(obj.$type$, [type, obj.id], obj));
                }
                value = array;
            } else if (value instanceof java.util.Date) {
                value = new Date(value.time);
            } else {
                value = org.mozilla.javascript.Context.javaToJS(value, global);
            }
            props[i] = value;
        }
    }
    return props;
}

function getEntity(type, arg) {
    if (isEntity(arg)) {
        return arg;
    } else if (arg instanceof Object) {
        var entity = new ScriptableMap(new java.util.HashMap(arg));
        entity.$type$ = type;
        return entity;
    }
    return null;
}

function getKey(type, arg) {
    if (isEntity(arg)) {
        return [type, arg.id];
    } else if (isKey(arg)) {
        return arg;
    }
    return null;
}

function getId(key) {
    return key[1];
}

function equalKeys(key1, key2) {
    return key1 && key2 &&
            key1[0] == key2[0] &&
            key1[1] == key2[1];
}

function isKey(value) {
    return value instanceof Array &&
            value.length == 2 &&
            typeof value[0] === 'string' &&
            typeof value[1] === 'string';
}

function isEntity(value) {
    return value instanceof ScriptableMap;
}

function isStorable(value) {
    return value instanceof Storable;
}
