/**
 * Storage module for using Hibernate as ORM/persistence layer.
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

importClass(org.hibernate.cfg.Configuration);

export('Storable', 'getSession', 'doInTxn');

var Storable = require('../storable').Storable;
Storable.setStoreImplementation(this);

var __shared__ = true;
var log = require('helma/logging').getLogger(__name__);

var configDirRelativePath = 'config';
var config, isConfigured = false;
var sessionFactory;

/**
 * Do something inside a Hibernate session transaction.
 *
 * @param func
 */
function doInTxn(func) {
    var txn, session = getSession();
    try {
        txn = session.beginTransaction();
        var result = func(session);
        txn.commit();
        return result;
    } catch (e) {
        if (txn != null) {
            txn.rollback();
        }
        log.error('Problem occured within Hibernate session transaction.');
        throw e;
    }
}

/**
 * Begins a Hibernate session transaction.
 *
 * @param session
 */
function beginTxn(session) {
    var txn, sess = session || getSession();
    try {
        txn = sess.beginTransaction();
    } catch (e) {
        if (txn != null) {
            txn.rollback();
        }
        log.error('Problem occured within Hibernate session transaction.');
        throw e;
    }
}

/**
 * Commits a Hibernate session transaction.
 *
 * @param session
 */
function commitTxn(session) {
    var txn, sess = session || getSession();
    try {
        txn = sess.transaction;
        txn.commit();
    } catch (e) {
        if (txn != null) {
            txn.rollback();
        }
        log.error('Problem occured within Hibernate session transaction.');
        throw e;
    }
}

/**
 * Gets a Hibernate DB session.
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
    var configDirAbsolutePath = getResource(configDirRelativePath).path;
    var configPropsFile = new java.io.File(configDirAbsolutePath
            + java.io.File.separator + 'hibernate.properties');
    var fileInputStream = new java.io.FileInputStream(configPropsFile);
    var configProps = new java.util.Properties();

    // load hibernate.properties
    configProps.load(fileInputStream);
    fileInputStream.close();

    config = new Configuration();
    config.addDirectory(new java.io.File(configDirAbsolutePath));
    config.setProperties(configProps);
    // use dynamic-map entity persistence mode
    config.setProperty('hibernate.default_entity_mode', 'dynamic-map');
    // transactions are handled by JDBC, no JTA is used
    config.setProperty('hibernate.transaction.factory_class',
            'org.hibernate.transaction.JDBCTransactionFactory');
    // enable session binding to managed context
    config.setProperty('hibernate.current_session_context_class', 'thread');
    // enable query cache
    config.setProperty('hibernate.cache.use_query_cache', 'true');
    // use easy hibernate (eh) cache
    config.setProperty('hibernate.cache.provider_class',
            'org.hibernate.cache.EhCacheProvider');
    // use c3p0 connection pooling
    config.setProperty('hibernate.connection.provider_class',
            'org.hibernate.connection.C3P0ConnectionProvider');
    isConfigured = true;
    sessionFactory = config.buildSessionFactory();
}

/**
 * Impl. of corresponding store method.
 *
 * @param type
 */
function all(type) {
    return doInTxn(function (session) {
        var criteria = session.createCriteria(type);
        criteria.setCacheable(true);
        var i, result = new ScriptableList(criteria.list());
        for (i in result) {
            // ScriptableList already wraps Maps into ScriptableMaps
            result[i] = new Storable(result[i].$type$, result[i]);
        }
        return result;
    });
}

/**
 * Impl. of corresponding store method.
 *
 * @param type
 * @param id
 */
function get(type, id) {
    return doInTxn(function (session) {
        var result = session.get(type, new java.lang.Long(id));
        if (result != null) {
            var entity = new ScriptableMap(result);
            result = new Storable(entity.$type$, entity);
        }
        return result;
    });
}

/**
 * Impl. of corresponding store method.
 *
 * @param props
 * @param entity
 * @param entities
 */
function save(props, entity, entities) {
    if (entities && entities.contains(entity)) {
        return;
    }
    var isRoot = false;
    if (!entities) {
        isRoot = true;
        entities = new java.util.HashSet();
        beginTxn();
    }
    entities.add(entity);
    for (var id in props) {
        var value = props[id];
        if (isStorable(value)) {
            value.save(entities);
            value = value._key;
        }
        entity[id] = value;
    }
    if (isRoot) {
        var session = getSession();
        var obj, i;
        for (i = 0; i < entities.size(); i++) {
            obj = entities.toArray()[i];
            if (obj.get('id') != null) {
                obj.put('id', new java.lang.Long(obj.get('id')));
            }
            session['saveOrUpdate(java.lang.String,java.lang.Object)']
                    (obj.$type$, obj);
        }
        commitTxn(session);
    }
}

/**
 * Impl. of corresponding store method.
 *
 * @param key
 */
function remove(key) {
    doInTxn(function (session) {
        var obj = session.get(key[0], new java.lang.Long(getId(key)));
        if (obj != null) {
            session['delete'](obj);
        }
    });
}

/**
 * Impl. of corresponding store method.
 *
 * @param type
 * @param arg
 */
function getProps(type, arg) {
    if (arg instanceof Object) {
        arg.$type$ = type;
        return arg;
    } else if (isEntity(arg)) {
        var props = {};
        for (var i in arg) {
            // don't copy type and id, not supposed to be editable props
            if (id != "$type" && id != "id") {
                props[i] = arg[i];
            }
        }
        return props;
    }
    return null;
}

/**
 * Impl. of corresponding store method.
 *
 * @param type
 * @param arg
 */
function getEntity(type, arg) {
    if (isEntity(arg)) {
        return arg;
    } else if (arg instanceof Object) {
        // TODO: because of a Rhino bug we can't call new HashMap(arg);
        var map = new java.util.HashMap();
        map.putAll(arg);
        var entity = new ScriptableMap(map);
        entity['$type$'] = type;
        return entity;
    }
    return null;
}

/**
 * Impl. of corresponding store method.
 *
 * @param type
 * @param arg
 */
function getKey(type, arg) {
    if (isEntity(arg)) {
        return [arg["$type$"], arg["id"]];
    } else if (isKey(arg)) {
        return arg;
    }
    return null;
}

/**
 * Impl. of corresponding store method.
 *
 * @param key
 */
function getId(key) {
    return key[1];
}

/**
 * Impl. of corresponding store method.
 *
 * @param key1
 * @param key2
 */
function equalKeys(key1, key2) {
    return key1 && key2
            && key1[0] == key2[0]
            && key1[1] == key2[1];
}

/**
 * Helper method for determining key.
 *
 * @param value
 */
function isKey(value) {
    return value instanceof Array
            && value.length == 2
            && typeof value[0] == 'string'
            && typeof value[1] == 'string';
}

/**
 * Helper method for determining entity.
 *
 * @param value
 */
function isEntity(value) {
    return value instanceof ScriptableMap;
}

/**
 * Helper method for determining Storable.
 *
 * @param value
 */
function isStorable(value) {
    return value instanceof Storable;
}
