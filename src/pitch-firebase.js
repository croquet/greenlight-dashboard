/* globals firebase */

import {firebaseConfig} from "./firebase-config-loader.js";

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

let boardSnapshotSubscriptions = {}; // {id: the return value from onSnapshot}
let boardsInfo = {}; // {id: {board document}}

let teamSnapshotSubscriptions = {}; // {id: the return value from onSnapshot}
let teamsInfo = {}; // {id: {team doc}}

let userSubscription = null;

let userBoardsSubscription = null;

// the first getUser call establishes the user callback, and presumably when the list of board changes, it is invoked.  When the boards field is different there, the boards react state will be updaated, which changes the boardSnapshots callbacks needs to trigger getting active users for those boards.

function initDatabase() {
    return new Promise((resolve, reject) => {
        firebase.auth().onAuthStateChanged((user) => {
            if (user) {
                user.getIdToken().then(() => {
                    return ensureUserRecord();
                }).then((record) => {
                    resolve(record);
                });
            } else {
                reject(new Error("login failed"));
            }
        }, (error) => {
            console.log(error);
            reject(error);
        });
    });
}

function ensureUserRecord() {
    let db = firebase.firestore();
    let user = firebase.auth().currentUser;
    if (!user) {return null;}

    let userRecord = {
        email: user.email,
        name: user.displayName,
        photoURL: user.photoURL,
        initials: initialsFrom(user.displayName),
    };

    let userRef = db.collection("users").doc(user.uid);

    return userRef.get().then((doc) => {
        let promise;
        if (!doc.exists) {
            promise = newUserDocs(user.displayName, user.uid);
        } else {
            promise = Promise.resolve(null);
        }

        return promise.then(() => {
            return userRef.set(userRecord, {merge: true});
        });
    }).catch((error) => console.log("userRef", error));
}

function signOut() {
    return firebase.auth().signOut().then(() => {
        return true;
    }).catch((error) => {
        console.log("failed to sign out, redirecting anyway", error);
        return false;
    });
}

function getUser(uid, watcher) {
    // the only case the watcher is passed in is the initialization time, and
    // that happens only when user and user.uid are properly set
    let db = firebase.firestore();
    let user = firebase.auth().currentUser;

    let callback = (doc, justAssign) => {
        if (!doc) {return null;}
        let data = doc.data();
        if (!data) {return null;}
        data = {...data};
        data.uid = doc.id;
        if (!justAssign && watcher) {
            watcher(data);
        }
        return Promise.resolve(data);
    };

    if (watcher) {
        if (!user || !user.uid) {return Promise.resolve(null);}

        let ref = db.collection("users").doc(user.uid);
        return ref.get().then((doc) => {
            if (!userSubscription && watcher) {
                userSubscription = ref.onSnapshot(callback);
            }
            return callback(doc, true);
        });
    }

    if (!uid) {
        if (user && user.uid) {
            uid = user.uid;
        }
    }

    if (!uid) {return Promise.resolve(null);}

    let ref = db.collection("users").doc(uid);
    return ref.get().then((doc) => {
        let data = {...doc.data()};
        data.uid = uid;
        return data;
    }).catch((error) => {
        console.log(error);
        return callback(null);
    });
}

function getUserBoards(watcher) {
    let db = firebase.firestore();
    let user = firebase.auth().currentUser;
    if (!user) {return Promise.resolve(null);}

    let callback = (doc, justAssign) => {
        if (!doc) {return null;}
        let data = doc.data();
        if (!data) {return null;}
        data = {...data};
        data.uid = doc.id;
        if (!justAssign && watcher) {
            watcher(data);
        }
        return Promise.resolve(data);
    };

    let ref = db.collection("userPitches").doc(user.uid);
    return ref.get().then((doc) => {
        if (!userBoardsSubscription && watcher) {
            userBoardsSubscription = ref.onSnapshot(callback);
        }
        return callback(doc, true);
    });
}

function getBoardInfo(boardId, watcher, errorer) {
    let callback = (doc, justAssign) => {
        let docData = doc.data();
        if (!docData) {
            console.log("likely that permission was changed: " + doc.id);
            forgetBoard(doc.id);
            if (errorer) {
                errorer(doc.id);
            }
            return null;
        }
        let data = {...docData};
        data.id = docRef.id;
        boardsInfo[boardId] = data;
        if (!justAssign && watcher) {
            watcher(data);
        }
        return data;
    };

    let errored = (_error) => {
        console.log("likely that permission was changed");
        forgetBoard(boardId);
        if (errorer) {
            errorer(boardId);
        }
    };

    let db = firebase.firestore();
    let docRef = db.collection("pitches").doc(boardId);
    return docRef.get().then((doc) => {
        if (doc.exists) {
            if (!boardSnapshotSubscriptions[docRef.id] && watcher) {
                boardSnapshotSubscriptions[docRef.id] = docRef.onSnapshot(callback, errored);
            }
            return callback(doc, true);
        }
        return null;
    }).catch((_error) => {
        console.log("board does not exist, or not suffiient permission");
        return null;
    });
}

function updateBoardInfo(boardId, newValues) {
    let db = firebase.firestore();
    let docRef = db.collection("pitches").doc(boardId);
    return docRef.set(newValues, {merge: true});
}

function addBoard(name, teamId, _watcher) {
    let user = firebase.auth().currentUser;
    if (!user) {return null;}
    let data = {name: name, teamId: teamId, sessionPassword: "abc"};
    let query = firebase.functions().httpsCallable("addPitch");
    return query(data);
}

function updateTeamInfo(teamId, newValues) {
    let db = firebase.firestore();
    let docRef = db.collection("pitchTeams").doc(teamId);
    return docRef.set(newValues, {merge: true});
}

function getTeamInfo(teamId, watcher, errorer) {
    let callback = (doc, justAssign) => {
        let docData = doc.data();
        if (!docData) {
            console.log("likely that permission was changed for teamId:" + doc.id);
            forgetTeam(doc.id);
            if (errorer) {
                errorer(doc.id);
            }
            return null;
        }
        let data = {...docData};
        data.id = docRef.id;
        teamsInfo[teamId] = data;
        if (!justAssign && watcher) {
            watcher(data);
        }
        return data;
    };

    let errored = (_error) => {
        console.log("likely that permission was changed");
        forgetTeam(teamId);
        if (errorer) {
            errorer(teamId);
        }
    };

    let db = firebase.firestore();
    let docRef = db.collection("pitchTeams").doc(teamId);
    return docRef.get().then((doc) => {
        if (doc.exists) {
            if (!teamSnapshotSubscriptions[docRef.id] && watcher) {
                teamSnapshotSubscriptions[docRef.id] = docRef.onSnapshot(callback, errored);
            }
            return callback(doc, true);
        }
        return null;
    }).catch((_error) => {
        console.log("board does not exist, or not suffiient permission");
        return null;
    });
}

function forgetTeam(teamId) {
    if (teamSnapshotSubscriptions[teamId]) {
        teamSnapshotSubscriptions[teamId]();
        delete teamSnapshotSubscriptions[teamId];
        delete teamsInfo[teamId];
    }
}

function addTeam(name, org) {
    let user = firebase.auth().currentUser;
    if (!user) {return null;}
    let query = firebase.functions().httpsCallable("addPitchTeam");
    return query({name, org});
}

function lookupUserFromEmail(email) {
    let db = firebase.firestore();
    let user = firebase.auth().currentUser;
    if (!user) {return null;}

    let ref = db.collection("users").where("email", "==", email);

    return ref.get().then((querySnapshot) => {
        if (querySnapshot.size === 1) {
            let doc = querySnapshot.docs[0];
            let mydata = {...doc.data()};
            mydata.uid = doc.id;
            return mydata;
        }
        return null;
    });
}

function getEmailForUser(userId) {
    let db = firebase.firestore();
    let user = firebase.auth().currentUser;
    if (!user) {return Promise.resolve(null);}
    let ref = db.collection("users").doc(userId);
    return ref.get().then((doc) => {
        return doc.data().email;
    }).catch((_error) => {
        return null;
    });
}

function newUserDocs(name) {
    let user = firebase.auth().currentUser;
    if (!user) {return null;}
    let query = firebase.functions().httpsCallable("newUserDocs");
    return query({name});
}

function postLastUpdated(data) {
    let user = firebase.auth().currentUser;
    //if (!user) {return null;}
    let lastUpdated = firebase.functions().httpsCallable("lastUpdatedPitch");
    return lastUpdated(data);
}

function updateBoardUser(data) {
    let query = firebase.functions().httpsCallable("updatePitchUser");
    return query(data);
}

function updateTeamUser(data) {
    let query = firebase.functions().httpsCallable("updatePitchTeamUser");
    return query(data);
}

function deleteBoard(data) {
    let user = firebase.auth().currentUser;
    if (!user) {return null;}
    let func = firebase.functions().httpsCallable("deletePitch");
    return func(data);
}

function deleteTeam(data) {
    let user = firebase.auth().currentUser;
    if (!user) {return null;}
    let func = firebase.functions().httpsCallable("deletePitchTeam");
    return func(data);
}

function testCollection(data) {
    let query = firebase.functions().httpsCallable("testCollection");
    return query(data);
}

/*
function clearUsers(data) {
    let query = firebase.functions().httpsCallable("clearUsers");
    return query(data);
}
*/

/*
function populateUserBoards(data) {
    let query = firebase.functions().httpsCallable("populateUserBoards");
    return query(data);
}
*/

function forgetBoard(boardId) {
    let unsubscribe = boardSnapshotSubscriptions[boardId];
    if (unsubscribe) {
        delete boardSnapshotSubscriptions[boardId];
        unsubscribe();
    }
    delete boardsInfo[boardId];
}

function forgetAllBoards() {
    for (let boardId in boardSnapshotSubscriptions) {
        forgetBoard(boardId);
    }
}

function forgetAllSubscriptions() {
    forgetAllBoards();

    if (userSubscription) {
        userSubscription();
        userSubscription = null;
    }

    if (userBoardsSubscription) {
        userBoardsSubscription();
        userBoardsSubscription = null;
    }
}

function emailsStartsWith(emailPrefix) {
    let db = firebase.firestore();
    let user = firebase.auth().currentUser;
    if (!user) {return Promise.resolve(null);}

    if (emailPrefix.length < 1) {return Promise.resolve([]);}

    let emailEnd = String.fromCharCode(emailPrefix.charCodeAt(0) + 1);

    let ref = db.collection("users");

    let query = ref.orderBy("email").where("email", ">=", emailPrefix).where("email", "<", emailEnd).limit(10);

    return query.get().then((querySnapshot) => {
        let result = [];
        querySnapshot.forEach((doc) => {
            let data = doc.data();
            result.push({email: data.email, uid: doc.id});
        });
        return result;
    }).catch((error) => {
        console.log(error);
        return [];
    });
}

function initialsFrom(nickname) {
    if (!nickname) {
        return "";
    }

    let pieces = nickname.split(" ").filter(p => p.length > 0);

    if (pieces.length === 0) {
        return "";
    } if (pieces.length === 1) {
        return pieces[0].slice(0, 2).toUpperCase();
    }

    let name = pieces.map(p => p[0]);
    name = name[0] + name.slice(-1);
    return name.toUpperCase();
}

export const Database = {
    initDatabase,
    signOut,
    getUser,

    getUserBoards,
    getBoardInfo,
    updateBoardInfo,
    addBoard,
    deleteBoard,

    lookupUserFromEmail,
    getEmailForUser,

    postLastUpdated,
    updateBoardUser,
    updateTeamUser,

    updateTeamInfo,
    addTeam,
    getTeamInfo,
    deleteTeam,

    emailsStartsWith,

    testCollection,
    // clearUsers,
    // populateUserBoards,
    forgetBoard,
    forgetAllBoards,
    forgetAllSubscriptions,
    forgetTeam,
};
