/**
 * @fileOverview Storage module for using Hibernate as ORM/persistence layer.
 */

addToClasspath('./lib/antlr-2.7.6.jar');
addToClasspath('./lib/c3p0-0.9.1.jar');
addToClasspath('./lib/commons-collections-3.1.jar');
addToClasspath('./lib/commons-logging-1.1.1.jar');
addToClasspath('./lib/dom4j-1.6.1.jar');
addToClasspath('./lib/ehcache-1.2.3.jar');
addToClasspath('./lib/hibernate3.jar');
addToClasspath('./lib/javassist-3.4.GA.jar');
addToClasspath('./lib/jta-1.1.jar');

importPackage(java.io);
importClass(org.hibernate.cfg.Configuration);
include('ringo/engine');
include('ringo/functional');

addHostObject(org.ringojs.wrappers.Storable);
export('defineClass', 'withSession');

module.shared = true;
var registry = {};
var self = this;
var log = require('ringo/logging').getLogger(module.id);
var isConfigured = false;
var config, sessionFactory;

function defineClass(type) {
    var ctor = registry[type];
    if (!ctor) {
        ctor = registry[type] = Storable.defineClass(self, type);
        ctor.all = bindArguments(all, type);
        ctor.get = bindArguments(get, type);
        // ctor.query = bindArguments(query, type); // TODO: impl. query API.
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
    var transaction;
    var session = getSession();
    try {
        transaction = beginTransaction(session);
        var result = func(session);
        commitTransaction(session);
        return result;
    } catch (error) {
        abortTransaction(transaction, error);
    }
}

/**
 * Begins a Hibernate session transaction.
 *
 * @param session the Hibernate session
 * @returns transaction
 */
function beginTransaction(session) {
    transactionTemplate(session, function (transaction) {
        transaction = session.beginTransaction();
        return transaction;
    });
}

/**
 * Commits a Hibernate session transaction.
 *
 * @param session the Hibernate session
 * @returns transaction
 */
function commitTransaction(session) {
    transactionTemplate(session, function (transaction) {
        transaction = session.transaction;
        transaction.commit();
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
    if (transaction != null) {
        transaction.rollback(); // Rollback if something went wrong.
    }
    log.error('Problem occurred within Hibernate session transaction.');
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
        transaction = func(transaction);
    } catch (error) {
        abortTransaction(transaction, error);
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
    return sessionFactory.currentSession;
}

/**
 * Configures Hibernate.
 */
function configure() {
    var configDirAbsolutePath = new File('config').getAbsolutePath();
    var fileInputStream = new FileInputStream(new File(configDirAbsolutePath +
            File.separator + 'hibernate.properties'));
    var configProps = new java.util.Properties();
    configProps.load(fileInputStream);
    fileInputStream.close();
    config = new Configuration();
    config.addDirectory(new File(configDirAbsolutePath));
    config.setProperties(configProps);
    // Use dynamic-map entity persistence mode.
    config.setProperty('hibernate.default_entity_mode', 'dynamic-map');
    // Transactions are handled by JDBC, no JTA is used.
    config.setProperty('hibernate.transaction.factory_class',
            'org.hibernate.transaction.JDBCTransactionFactory');
    // Enable session binding to managed context.
    config.setProperty('hibernate.current_session_context_class', 'thread');
    // Enable query cache.
    config.setProperty('hibernate.cache.use_query_cache', 'true');
    // Use easy hibernate (eh) cache.
    config.setProperty('hibernate.cache.provider_class',
            'org.hibernate.cache.EhCacheProvider');
    // Use c3p0 connection pooling.
    config.setProperty('hibernate.connection.provider_class',
            'org.hibernate.connection.C3P0ConnectionProvider');
    isConfigured = true;
    sessionFactory = config.buildSessionFactory();
}

function create(type, key, entity) {
    var ctor = registry[type];
    return ctor.createInstance(key, entity);
}

function all(type) {
    return withSession(function (session) {
        var criteria = session.createCriteria(type);
        criteria.setCacheable(true);
        var i, list = new ScriptableList(criteria.list());
        for (i in list) {
            list[i] = create(type, list[i].id, list[i]);
            list[i].$type$ = type;
        }
        return list;
    });
}

function get(type, id) {
    return withSession(function (session) {
        var result = session.get(type, new java.lang.Long(id));
        if (result != null) {
            var entity = new ScriptableMap(result);
            result = create(type, entity.id, entity);
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
    for (var id in props) {
        var value = props[id];
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
        entity[id] = value;
    }
    if (isRoot) {
        for each (var obj in entities.toArray()) {
            if (!isStorable(obj)) {
                obj = new ScriptableMap(obj);
            }
            if (obj.id != undefined) {
                obj.id = new java.lang.Long(obj.id);
            }
            session['saveOrUpdate(java.lang.String,java.lang.Object)'](obj.
                    $type$, obj);
        }
    }
    commitTransaction(session);
}

function remove(key) { // TODO: FIXME: doesn't work right ATM.
    withSession(function (session) {
        var obj = session.get(key[0], new java.lang.Long(getId(key)));
        if (obj != null) {
            session['delete'](obj);
        }
    });
}

function getProps(type, arg) {
    if (arg instanceof Object) {
        arg.$type$ = type;
        return arg;
    } else if (isEntity(arg)) {
        var id, value, props = {};
        for (id in arg) {
            // don't copy type and id, not supposed to be editable props
            if (id != '$type$' && id != 'id') {
                value = arg[id];
                if (value instanceof java.util.Set) {
                    var array = [];
                    for (var it = value.iterator(); it.hasNext(); ) {
                        var obj = it.next();
                        array.push(create(obj.$type$, obj.id, obj));
                    }
                    value = array;
                } else {
                    value = Context.javaToJS(value, global);
                }
                props[id] = value;
            }
        }
        return props;
    }
    return null;
}

function getEntity(type, arg) {
    if (isEntity(arg)) {
        return arg;
    } else if (arg instanceof Object) {
        // TODO: because of a Rhino bug we can't call new HashMap(arg);
        var map = new java.util.HashMap();
        map.putAll(arg);
        var entity = new ScriptableMap(map);
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
    return key1 && key2
            && key1[0] == key2[0]
            && key1[1] == key2[1];
}

function isKey(value) {
    return value instanceof Array
            && value.length == 2
            && typeof value[0] == 'string'
            && typeof value[1] == 'string';
}

function isEntity(value) {
    return value instanceof ScriptableMap;
}

function isStorable(value) {
    return value instanceof Storable;
}
