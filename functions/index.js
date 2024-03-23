const functions = require("firebase-functions");
const admin = require("firebase-admin");
const https = require("https");
const {Storage} = require("@google-cloud/storage");
const {google} = require("googleapis");
const FieldValue = admin.firestore.FieldValue;

admin.initializeApp();

function orgSchema(name, uid) {
    return {
        name,
        billingInfo: "xxxx-xxxx-xxxx-xxxx",
        ownerId: uid,
        ownerIds: {[uid]: true},
        teams: {[uid]: true},
        lastActivityTime: FieldValue.serverTimestamp()
    };
}

function teamSchema(name, uid, orgId) {
    return {
        name,
        ownerId: uid,
        ownerIds: {[uid]: true},
        userIds: {},
        boards: {},
        orgId: orgId,
        lastActivityTime: FieldValue.serverTimestamp()
    };
}

function sanitizeViewId(viewId) {
    return viewId.replace(/\W/g, "");
}

function presenceBody(boardsColName, accessColName, sessionId, boardId, time, all, _left, _joined) {
    // expects that content-type is application/json
    console.log("presence:", sessionId, boardId, all.length, all.join(","));

    let boardRef = admin.firestore().collection(boardsColName).doc(boardId);
    let accessRef;

    if (accessColName) {
        accessRef = admin.firestore().collection(accessColName).doc(boardId);
    }

    let clearAccess = (aRef) => {
        return aRef.delete();
    };

    return admin.firestore().runTransaction((transaction) => {
        return transaction.get(boardRef).then((boardDoc) => {
            if (!boardDoc.exists) {
                if (accessRef) {
                    clearAccess(accessRef);
                }
                console.log("doc not found");
                return null;
            }

            let data = boardDoc.data();
            let oldValues = data.activeViewIds || {}; // already sanitized

            let allKeys = {};
            let count = 0;
            all.forEach((k) => {
                let sanitized = sanitizeViewId(k);
                allKeys[sanitized] = true;
                count++;
            });

            Object.keys(oldValues).forEach((old) => {
                if (!allKeys[old]) {
                    transaction.update(boardRef, `activeViewIds.${old}`, FieldValue.delete());
                }
            });

            if (accessRef && count === 0) {
                return clearAccess(accessRef);
            }
            return null;
        }).then((v) => {
            return v !== null;
        });
    });
}

exports.presenceBody = presenceBody;

function lastUpdatedBody(data, context, boardColName, userBoardsColName, accessColName, recentName) {
    // let thumbnail = data.thumbnail;
    let uid = context.auth && context.auth.uid;
    let boardId = data.boardId;
    let sessionId = data.sessionId;
    let viewId = data.viewId;
    let guestName = data.guestName;

    console.log("lastUpdated version 8");

    if (typeof boardId !== "string" ||
        typeof sessionId !== "string" ||
        typeof viewId !== "string") {
        throw new functions.https.HttpsError("invalid-argument", "parameters are not well typed");
    }

    console.log("lastUpdated", boardId, uid, viewId, guestName);

    let hasUid = !!uid;

    let obj = {
        uid: uid || null,
        guestName: guestName || "unused",
        viewId,
        time: FieldValue.serverTimestamp()
    };

    // if (thumbnail) {
    // obj.thumbnail = thumbnail;
    // }

    let boardRef = admin.firestore().collection(boardColName).doc(boardId);
    let userRef;
    let accessRef;
    let recentCollectionRef;

    let getArg = [boardRef];

    if (hasUid) {
        userRef = admin.firestore().collection(userBoardsColName).doc(uid);
        getArg.push(userRef);
    }

    if (accessColName) {
        accessRef = admin.firestore().collection(accessColName).doc(boardId);
    }

    if (recentName) {
        recentCollectionRef = admin.firestore().collection(recentName);
    }

    return admin.firestore().runTransaction((transaction) => {
        return transaction.getAll(...getArg).then(([boardDoc, userDoc]) => {
            let docData = boardDoc.data();
            let userIds = docData.userIds || {};
            let ownerIds = docData.ownerIds || {};
            let team = docData.team;
            let access = docData.access;

            let teams = {};
            if (hasUid) {
                let userData = userDoc.data();
                teams = userData.teams;
            }

            let sanitized = sanitizeViewId(viewId);

            if (!((access === "public") ||
                  (access === "team" &&
                   (teams[team] ||
                    ownerIds[uid] || userIds[uid])) ||
                  (access === "private" &&
                   ownerIds[uid] || userIds[uid]))) {
                throw new Error("Not permitted");
            }
            transaction.set(boardRef, {activeViewIds: {[sanitized]: obj}, lastActivityTime: FieldValue.serverTimestamp(), sessionId}, {merge: true});
            if (hasUid) {
                transaction.set(userRef, {boards: {[boardId]: true}}, {merge: true});
            }

            if (accessRef && hasUid) {
                transaction.set(accessRef, {userIds: {[uid]: true}}, {merge: true});
            }

            if (recentName) {
                recentCollectionRef.doc(boardId).set({yes: true});
            }
            return {updated: boardId};
        });
    }).catch((error) => {
        console.log("catch: " + error.message);
        throw new functions.https.HttpsError("aborted", error.message);
    });
}

function updateBoardUserBody(data, context, boardsColName, userBoardsColName) {
    let uid = context.auth.uid;

    console.log("updateBoardUserBody version 11");

    if (!uid) {
        throw new functions.https.HttpsError("unauthenticated", "not signed in");
    }

    let boardId = data.boardId;
    let userId = data.userId;
    let type = data.type; // "addOwner"|"addUser"|"removeOwner"|"removeUser"

    if (typeof boardId !== "string" ||
        typeof userId !== "string" ||
        typeof type !== "string") {
        throw new functions.https.HttpsError("invalid-argument", "parameters are not well typed");
    }

    let boardRef = admin.firestore().collection(boardsColName).doc(boardId);
    let userRef = admin.firestore().collection(userBoardsColName).doc(userId);

    return admin.firestore().runTransaction((transaction) => {
        return transaction.getAll(boardRef, userRef).then(([boardDoc, userDoc]) => {
            let docData = boardDoc.data();
            let currentUserIds = docData.userIds;
            let currentOwnerIds = docData.ownerIds;

            if (!currentOwnerIds[uid]) {
                throw new Error("no permission");
            }

            if (userId === undefined) {
                throw new Error("no user specified");
            }

            if (!userDoc.exists) {
                throw new Error("userId does not exist");
            }

            let userData = userDoc.data();
            let currentBoards = userData.boards;

            if (!currentBoards) {
                throw new Error("userId does not exist");
            }

            if (type === "addOwner") {
                if (!currentBoards[boardId]) {
                    throw new Error(`suddenly becoming owner ${boardId} ${userId}`);
                }

                if (currentOwnerIds[userId]) {
                    throw new Error(`user ${userId} is already owner`);
                }

                transaction.set(boardRef, {ownerIds: {[userId]: true}}, {merge: true});
                transaction.update(boardRef, `userIds.${userId}`, FieldValue.delete());
                transaction.set(userRef, {lastActivityTime: FieldValue.serverTimestamp()}, {merge: true});
                return {success: "addOwner"};
            }
            if (type === "addUser") {
                if (currentBoards[boardId]) {
                    console.log(`currentBoard already has ${boardId}`);
                }

                if (currentOwnerIds[userId]) {
                    throw new Error(`user ${userId} is already owner`);
                }

                transaction.set(boardRef, {userIds: {[userId]: true}}, {merge: true});
                transaction.set(userRef, {boards: {[boardId]: true}, lastActivityTime: FieldValue.serverTimestamp()}, {merge: true});
                return {success: "addUser"};
            }
            if (type === "removeOwner") {
                if (!currentOwnerIds[userId]) {
                    console.log("currentOwnerId does not include " + userId);
                    throw new Error(`currentOwnerId does not include ${userId}`);
                }

                if (Object.keys(currentOwnerIds).length === 1) {
                    console.log("cannot remove the last owner");
                    throw new Error("cannot remove the last owner");
                }

                transaction.set(boardRef, {userIds: {[userId]: true}}, {merge: true});
                transaction.update(boardRef, `ownerIds.${userId}`, FieldValue.delete());
                transaction.set(userRef, {lastActivityTime: FieldValue.serverTimestamp()}, {merge: true});
                return {success: "removeOwner"};
            }
            if (type === "removeUser") {
                if (!currentUserIds[userId]) {
                    console.log("user is not in the userIds");
                }

                if (currentOwnerIds[userId]) {
                    throw new Error("owner cannot be removed as a user");
                }

                transaction.set(userRef, {lastActivityTime: FieldValue.serverTimestamp()}, {merge: true});
                transaction.update(userRef, `boards.${boardId}`, FieldValue.delete());
                transaction.update(boardRef, `userIds.${userId}`, FieldValue.delete());
                return {success: "removeUser"};
            }
            throw new Error("unknown operation type");
        }).catch((error) => {
            console.log("catch: " + error.message);
            throw new functions.https.HttpsError("aborted", error.message);
        });
    });
}

function updateTeamUserBody(data, context, teamColName, userBoardsColName, accessColName) {
    let uid = context.auth.uid;

    console.log("updateTeamBody version 6");

    if (!uid) {
        throw new functions.https.HttpsError("unauthenticated", "not signed in");
    }

    let teamId = data.teamId;
    let userId = data.userId;
    let type = data.type; // "addOwner"|"addUser"|"removeOwner"|"removeUser"

    if (typeof teamId !== "string" ||
        typeof userId !== "string" ||
        typeof type !== "string") {
        throw new functions.https.HttpsError("invalid-argument", "parameters are not well typed");
    }

    let teamRef = admin.firestore().collection(teamColName).doc(teamId);
    let userRef = admin.firestore().collection(userBoardsColName).doc(userId);

    let accessColRef;
    if (accessColName) {
        accessColRef = admin.firestore().collection(accessColName);
    }

    return admin.firestore().runTransaction((transaction) => {
        return transaction.getAll(teamRef, userRef).then(([teamDoc, userDoc]) => {
            let docData = teamDoc.data();
            let currentUserIds = docData.userIds;
            let currentOwnerIds = docData.ownerIds;
            let teamBoards = docData.boards;

            if (!currentOwnerIds[uid]) {
                throw new Error("no permission");
            }

            if (userId === undefined) {
                throw new Error("no user specified");
            }

            if (!userDoc.exists) {
                throw new Error("userId does not exist");
            }

            let userData = userDoc.data();
            let currentTeams = userData.teams;
            let currentBoards = userData.boards;

            if (!currentTeams) {
                throw new Error("userId does not exist");
            }

            if (type === "addOwner") {
                if (!currentTeams[teamId] || !currentUserIds[userId]) {
                    throw new Error(`suddenly becoming owner ${teamId} ${userId}`);
                }

                transaction.set(teamRef, {ownerIds: {[userId]: true}, lastActivityTime: FieldValue.serverTimestamp()}, {merge: true});
                transaction.update(teamRef, `userIds.${userId}`, FieldValue.delete());
                transaction.set(userRef, {lastActivityTime: FieldValue.serverTimestamp()}, {merge: true});
                return {success: "addOwner"};
            }
            if (type === "addUser") {
                if (currentTeams[teamId]) {
                    console.log(`currentTeam already has ${teamId}`);
                }

                if (currentOwnerIds[userId]) {
                    throw new Error(`user ${userId} is already owner`);
                }

                transaction.set(teamRef, {userIds: {[userId]: true}, lastActivityTime: FieldValue.serverTimestamp()}, {merge: true});
                transaction.set(userRef, {teams: {[teamId]: true}, lastActivityTime: FieldValue.serverTimestamp()}, {merge: true});

                // just merge all boards of the team into userPitch.
                transaction.set(userRef, {boards: teamBoards}, {merge: true});

                if (accessColRef) {
                    for (let boardId in teamBoards) {
                        let accessRef = accessColRef.doc(boardId);
                        transaction.set(accessRef, {userIds: {[userId]: true}}, {merge: true});
                    }
                }
                return {success: "addUser"};
            }
            if (type === "removeOwner") {
                if (!currentOwnerIds[userId]) {
                    console.log("currentOwnerId does not include " + userId);
                    throw new Error(`currentOwnerId does not include ${userId}`);
                }

                if (Object.keys(currentOwnerIds).length === 1) {
                    console.log("cannot remove the last owner");
                    throw new Error("cannot remove the last owner");
                }

                transaction.set(teamRef, {userIds: {[userId]: true}, lastActivityTime: FieldValue.serverTimestamp()}, {merge: true});
                transaction.update(teamRef, `ownerIds.${userId}`, FieldValue.delete());
                transaction.set(userRef, {lastActivityTime: FieldValue.serverTimestamp()}, {merge: true});

                return {success: "removeOwner"};
            }
            if (type === "removeUser") {
                if (!currentUserIds[userId]) {
                    console.log("user is not in the userIds");
                }

                if (currentOwnerIds[userId]) {
                    throw new Error("owner cannot be removed as a user");
                }

                transaction.set(userRef, {lastActivityTime: FieldValue.serverTimestamp()}, {merge: true});
                transaction.update(userRef, `teams.${teamId}`, FieldValue.delete());
                transaction.update(teamRef, `userIds.${userId}`, FieldValue.delete());
                transaction.set(teamRef, {lastActivityTime: FieldValue.serverTimestamp()}, {merge: true});
                let newBoards = {...currentBoards};
                for (let boardId in teamBoards) {
                    delete newBoards[boardId];
                }
                transaction.update(userRef, "boards", newBoards);

                if (accessColRef) {
                    for (let boardId in teamBoards) {
                        let accessRef = accessColRef.doc(boardId);
                        transaction.update(accessRef, `userIds.${userId}`, FieldValue.delete());
                    }
                }
                return {success: "removeUser"};
            }
            throw new Error("unknown operation type");
        }).catch((error) => {
            console.log("catch: " + error.message);
            throw new functions.https.HttpsError("aborted", error.message);
        });
    });
}

function addBoardBody(data, context, boardColName, teamColName, userBoardColName, accessColName) {
    let uid = context.auth.uid;

    console.log("addBoardBody version 10");

    if (!uid) {
        throw new functions.https.HttpsError("unauthenticated", "not signed in");
    }

    let name = data.name;
    let teamId = data.teamId || uid;
    let sessionPassword = data.sessionPassword;

    if (typeof name !== "string" ||
        typeof teamId !== "string" ||
        !(typeof sessionPassword === "string" || sessionPassword === undefined)) {
        throw new functions.https.HttpsError("invalid-argument", "parameters are not well typed");
    }

    let lastActivityTime = FieldValue.serverTimestamp();

    let value = {
        name,
        sessionPassword: sessionPassword || "abc",
        ownerId: uid,
        ownerIds: {[uid]: true},
        userIds: {},
        team: teamId,
        activeViewIds: {}, // {viewId: {uid, time}}
        access: "public", // "team"
        chat: "noChat",
        lastActivityTime: lastActivityTime
    };

    let newBoardRef = admin.firestore().collection(boardColName).doc();
    let teamRef = admin.firestore().collection(teamColName).doc(teamId);
    let userRef = admin.firestore().collection(userBoardColName).doc(uid);
    let accessColRef;
    if (accessColName) {
        accessColRef = admin.firestore().collection(accessColName);
    }

    return admin.firestore().runTransaction((transaction) => {
        return transaction.get(teamRef).then((teamDoc) => {
            debugger;
            let teamData = teamDoc.data();
            if (!teamData || !teamData.ownerIds[uid]) {
                throw new Error("user is not a member of the team");
            }

            let keys = [...Object.keys(teamData.userIds), ...Object.keys(teamData.ownerIds)];

            transaction.set(newBoardRef, value);
            transaction.set(teamRef, {boards: {[newBoardRef.id]: true}, lastActivityTime}, {merge: true});

            /* uid is included in keys so the loop below will take care of it, but
               this line is kept for compatibility with Q */
            transaction.set(userRef, {boards: {[newBoardRef.id]: true}, lastActivityTime}, {merge: true});

            if (accessColRef) {
                let newValue = {};
                keys.forEach((key) => {
                    newValue[key] = true;
                });
                let accessRef = accessColRef.doc(newBoardRef.id);
                // console.log("adding access to " + newBoardRef.id, newValue);
                transaction.set(accessRef, {userIds: newValue});
            }

            keys.forEach((key) => {
                let memberRef = admin.firestore().collection(userBoardColName).doc(key);
                transaction.set(memberRef, {boards: {[newBoardRef.id]: true}, lastActivityTime}, {merge: true});
            });
            return {success: "addBoard for team", id: newBoardRef.id};
        });
    }).catch((error) => {
        console.log(error);
        throw new functions.https.HttpsError("aborted", error.message);
    });
}

function deleteBoardBody(data, context, boardsColName, teamColName, userBoardsColName, accessColName) {
    let uid = context.auth.uid;

    if (!uid) {
        throw new functions.https.HttpsError("unauthenticated", "not signed in");
    }

    let boardId = data.boardId;

    console.log("deleteBoardBody version 10", boardId);

    if (typeof boardId !== "string") {
        throw new functions.https.HttpsError("invalid-argument", "parameters are not well typed");
    }

    let boardRef = admin.firestore().collection(boardsColName).doc(boardId);
    let teamRef;

    let accessRef;
    if (accessColName) {
        accessRef = admin.firestore().collection(accessColName).doc(boardId);
    }

    return admin.firestore().runTransaction((transaction) => {
        return transaction.get(boardRef).then((boardDoc) => {
            let boardData = boardDoc.data();
            if (!boardData) {
                console.log("board does not exist");
                throw new Error("board does not exist");
            }
            let team = boardData.team;
            teamRef = admin.firestore().collection(teamColName).doc(team);
            console.log("delete team board " + boardId + " of " + team);

            return transaction.get(teamRef);
        }).then((teamDoc) => {
            if (!teamDoc) {
                console.log("team is not found");
                throw new Error("team is not found");
            }
            return teamDoc.data();
        }).then((teamData) => {
            let teamOwnerIds = teamData.ownerIds;

            if (!teamOwnerIds[uid]) {
                console.log("user is not owner of the team");
                throw new Error("user is not owner of the team");
            }
            return true;
        }).then(() => {
            if (accessRef) {
                return transaction.get(accessRef);
            }
            return null;
        }).then((maybeAccessDoc) => {
            let keys = [];
            if (maybeAccessDoc) {
                if (maybeAccessDoc.exists) {
                    let accessData = maybeAccessDoc.data();
                    keys = Object.keys(accessData.userIds);
                }
            }

            console.log("delete board from " + keys.length + " users");

            keys.forEach((userId) => {
                let userRef = admin.firestore().collection(userBoardsColName).doc(userId);
                // console.log(`deleting boards.${boardId} from ${userId}`);
                transaction.update(userRef, `boards.${boardId}`, FieldValue.delete());
                transaction.set(userRef, {lastActivityTime: FieldValue.serverTimestamp()}, {merge: true});
            });

            transaction.update(teamRef, `boards.${boardId}`, FieldValue.delete());
            transaction.set(teamRef, {lastActivityTime: FieldValue.serverTimestamp()}, {merge: true});
            transaction.delete(boardRef);

            if (accessRef) {
                transaction.delete(accessRef);
            }
            return {success: "team board deleted", id: boardId};
        });
    }).catch((error) => {
        console.log("catch: " + error.message);
        throw new functions.https.HttpsError("aborted", error.message);
    });
}

function addTeamBody(data, context, teamColName, userBoardColName) {
    let uid = context.auth.uid;
    let name = data.name;
    let orgId = data.org;

    console.log("addTeamBody version 3");

    if (!uid) {
        throw new functions.https.HttpsError("unauthenticated", "not signed in");
    }

    if (typeof name !== "string") {
        throw new functions.https.HttpsError("invalid-argument", "parameters are not well typed");
    }

    let value = teamSchema(name, uid, orgId || uid);

    let batch = admin.firestore().batch();
    let newTeamRef = admin.firestore().collection(teamColName).doc();
    let userRef = admin.firestore().collection(userBoardColName).doc(uid);

    batch.set(newTeamRef, value);
    batch.set(userRef, {teams: {[newTeamRef.id]: true}, lastActivityTime: FieldValue.serverTimestamp()}, {merge: true});

    return batch.commit().then(() => {
        return newTeamRef.id;
    }).catch((error) => {
        console.log(error);
        throw new functions.https.HttpsError("aborted", error.message);
    });
}

function deleteTeamBody(data, context, teamColName, userBoardColName) {
    let uid = context.auth.uid;
    let teamId = data.teamId;

    console.log("deleteTeamBody version 4");

    if (!uid) {
        throw new functions.https.HttpsError("unauthenticated", "not signed in");
    }

    if (typeof teamId !== "string") {
        throw new functions.https.HttpsError("invalid-argument", "parameters are not well typed");
    }

    let teamRef = admin.firestore().collection(teamColName).doc(teamId);
    return admin.firestore().runTransaction((transaction) => {
        return transaction.get(teamRef).then((teamDoc) => {
            let teamData = teamDoc.data();
            let userIds = teamData.userIds;
            let ownerIds = teamData.ownerIds || {};
            let boards = teamData.boards || {};

            if (!ownerIds[uid]) {
                throw new Error("user is not an owner");
            }

            if (Object.keys(boards).length > 0) {
                throw new Error("team still has rooms");
            }

            if (uid === teamId) {
                throw new Error("user's own team cannot be deleted");
            }

            let keys = [...Object.keys(userIds), ...Object.keys(ownerIds)];
            keys.forEach((userId) => {
                let userRef = admin.firestore().collection(userBoardColName).doc(userId);
                transaction.update(userRef, `teams.${teamId}`, FieldValue.delete());
                transaction.set(userRef, {lastActivityTime: FieldValue.serverTimestamp()}, {merge: true});
            });

            transaction.delete(teamRef);
            return {success: "deleteTeam", id: teamId};
        }).catch((error) => {
            console.log(error);
            throw new functions.https.HttpsError("aborted", error.message);
        });
    });
}

function addOrganizationBody(data, context, orgColName, userBoardColName) {
    let uid = context.auth.uid;
    let name = data.name;

    console.log("addOrganizationBody version 1");

    if (!uid) {
        throw new functions.https.HttpsError("unauthenticated", "not signed in");
    }

    if (typeof name !== "string") {
        throw new functions.https.HttpsError("invalid-argument", "parameters are not well typed");
    }

    let value = orgSchema(name, uid);

    let batch = admin.firestore().batch();
    let newOrgRef = admin.firestore().collection(orgColName).doc();
    let userRef = admin.firestore().collection(userBoardColName).doc(uid);

    batch.set(newOrgRef, value);
    batch.set(userRef, {orgs: {[newOrgRef.id]: true}, lastActivityTime: FieldValue.serverTimestamp()}, {merge: true});

    return batch.commit().then(() => {
        return {success: "addOrg for user", id: newOrgRef.id};
    }).catch((error) => {
        console.log(error);
        throw new functions.https.HttpsError("aborted", error.message);
    });
}

function deleteOrganizationBody(data, context, teamColName, userBoardColName) {
    let uid = context.auth.uid;
    let orgId = data.orgId;

    console.log("deleteOrg version 1");

    if (!uid) {
        throw new functions.https.HttpsError("unauthenticated", "not signed in");
    }

    if (typeof orgId !== "string") {
        throw new functions.https.HttpsError("invalid-argument", "parameters are not well typed");
    }

    let orgRef = admin.firestore().collection(teamColName).doc(orgId);
    return admin.firestore().runTransaction((transaction) => {
        return transaction.get(orgRef).then((orgDoc) => {
            let orgData = orgDoc.data();
            let ownerIds = orgData.ownerIds || {};
            let teams = orgData.teams || {};

            if (!ownerIds[uid]) {
                throw new Error("user is not an owner");
            }

            if (Object.keys(teams).length !== 0) {
                throw new Error("org has some teams");
            }

            let keys = Object.keys(ownerIds);
            keys.forEach((k) => {
                let userRef = admin.firestore().collection(userBoardColName).doc(k);
                transaction.update(userRef, `orgs.${orgId}`, FieldValue.delete());
                transaction.set(userRef, {lastActivityTime: FieldValue.serverTimestamp()}, {merge: true});
            });

            transaction.delete(orgRef);
            return {success: "deleteOrg", id: orgId};
        }).catch((error) => {
            console.log(error);
            throw new functions.https.HttpsError("aborted", error.message);
        });
    });
}

exports.lastUpdated = functions.https.onCall((data, context) => {
    return lastUpdatedBody(data, context, "boards", "userBoards");
});


exports.newUserDocs = functions.https.onCall((data, context) => {
    let uid = context.auth.uid;
    let name = data.name;

    console.log("newUserDocs version 2");

    if (!uid) {
        throw new functions.https.HttpsError("unauthenticated", "not signed in");
    }

    function userBoardsSchema() {
        return {
            boards: {},
            teams: {[uid]: true},
            orgs: {[uid]: true},
        };
    }

    let userBoardsRef = admin.firestore().collection("userBoards").doc(uid);
    let orgRef = admin.firestore().collection("organizations").doc(uid);
    let teamRef = admin.firestore().collection("teams").doc(uid);

    let userPitchesRef = admin.firestore().collection("userPitches").doc(uid);
    let pitchOrgRef = admin.firestore().collection("pitchOrganizations").doc(uid);
    let pitchTeamRef = admin.firestore().collection("pitchTeams").doc(uid);

    return admin.firestore().runTransaction((transaction) => {
        return transaction.getAll(userBoardsRef, orgRef, teamRef, userPitchesRef, pitchOrgRef, pitchTeamRef).then(([boardDoc, orgDoc, teamDoc, pitchDoc, pitchOrgDoc, pitchTeamDoc]) => {
            if (!boardDoc.exists) {
                transaction.set(userBoardsRef, userBoardsSchema());
            } else {
                transaction.set(userBoardsRef, {teams: {[uid]: true}}, {merge: true});
                transaction.set(userBoardsRef, {orgs: {[uid]: true}}, {merge: true});
            }

            if (!teamDoc.exists) {
                transaction.set(teamRef, teamSchema(name, uid, uid));
            }

            if (!orgDoc.exists) {
                transaction.set(orgRef, orgSchema(name, uid));
            } else {
                transaction.set(orgRef, {teams: {[uid]: true}}, {merge: true});
            }

            if (!pitchDoc.exists) {
                transaction.set(userPitchesRef, userBoardsSchema());
            } else {
                transaction.set(userPitchesRef, {teams: {[uid]: true}}, {merge: true});
                transaction.set(userPitchesRef, {orgs: {[uid]: true}}, {merge: true});
            }

            if (!pitchTeamDoc.exists) {
                transaction.set(pitchTeamRef, teamSchema(name, uid, uid));
            }

            if (!pitchOrgDoc.exists) {
                transaction.set(pitchOrgRef, orgSchema(name, uid));
            } else {
                transaction.set(pitchOrgRef, {teams: {[uid]: true}}, {merge: true});
            }

            return transaction;
        });
    }).then(() => {
        return {success: "newUserDocs for user", id: uid};
    }).catch((error) => {
        console.log(error);
        throw new functions.https.HttpsError("aborted", error.message);
    });
});

exports.updateBoardUser = functions.https.onCall((data, context) => {
    return updateBoardUserBody(data, context, "boards", "userBoards");
});

exports.updateTeamUser = functions.https.onCall((data, context) => {
    return updateTeamUserBody(data, context, "teams", "userBoards");
});

function clearForOneBoard(doc, boardRef, accessCollectionRef) {
    let docData = doc.data();
    let sessionId = docData.sessionId;

    if (!sessionId) {
        return Promise.resolve(null);
    }

    let activeViewIds = docData.activeViewIds || {}; // sanitized

    return new Promise((resolve, _reject) => {
        let httpOptions = {
            hostname: 'croquet.io',
            port: 443,
            path: `/reflector/users/${sessionId}`,
            method: 'GET',
        };

        let req = https.request(httpOptions, (res) => {
            res.on("data", (resData) => {
                let reflectorData;
                try {
                    let rawReflectorData = JSON.parse(resData);
                    reflectorData = rawReflectorData.map(sanitizeViewId);
                } catch (e) {
                    reflectorData = [];
                }

                let promises = [];

                for (let viewId in activeViewIds) { // sanitized
                    if (reflectorData.indexOf(viewId) < 0) {
                        promises.push(boardRef.update(`activeViewIds.${viewId}`, FieldValue.delete()));
                    }
                }

                if (promises.length > 0) {
                    promises.push(boardRef.set({lastActivityTime: FieldValue.serverTimestamp()}, {merge: true}));
                }

                Promise.all(promises).then(() => {
                    if (reflectorData.length === 0 && accessCollectionRef) {
                        return accessCollectionRef.doc(doc.id).delete();
                    }
                    return null;
                }).then((v) => {
                    return resolve(v !== null);
                }).catch((_error) => {
                    resolve(false);
                });
            });

            res.on("error", (e) => {
                console.log(e);
                resolve({error: `${e}`});
            });
        });
        req.end();
    });
}

exports.clearForOneBoard = clearForOneBoard;

/*
exports.clearUsers = functions.pubsub.schedule('every 60 minutes').onRun((_context) => {
    // it removes users based on the users results from croquet.io/users endpoint
    // let uid = context.auth.uid;

    let boardCollectionRef = admin.firestore().collection("boards");
    let size;

    return boardCollectionRef.get().then((querySnapshot) => {
        let promises = [];
        querySnapshot.forEach((doc) => {
            let boardRef = boardCollectionRef.doc(doc.id);
            promises.push(clearForOneBoard(doc, boardRef));
        });
        size = promises.length;
        return Promise.all(promises);
        // I don't think this is any better style than having Promise.all([]).then but it
        // shuts up the linter.
    }).then(() => {
        return size;
    });
});

*/

exports.addBoard = functions.https.onCall((data, context) => {
    return addBoardBody(data, context, "boards", "teams", "userBoards");
});

exports.deleteBoard = functions.https.onCall((data, context) => {
    return deleteBoardBody(data, context, "boards", "teams", "userBoards");
});

exports.addTeam = functions.https.onCall((data, context) => {
    return addTeamBody(data, context, "teams", "userBoards");
});

exports.deleteTeam = functions.https.onCall((data, context) => {
    return deleteTeamBody(data, context, "teams", "userBoards");
});

exports.addOrganization = functions.https.onCall((data, context) => {
    return addOrganizationBody(data, context, "organizations", "userBoards");
});

exports.deleteOrganization = functions.https.onCall((data, context) => {
    return deleteOrganizationBody(data, context, "teams", "userBoards");
});

exports.addPitch = functions.https.onCall((data, context) => {
    return addBoardBody(data, context, "pitches", "pitchTeams", "userPitches", "pitchAccess");
});

exports.deletePitch = functions.https.onCall((data, context) => {
    return deleteBoardBody(data, context, "pitches", "pitchTeams", "userPitches", "pitchAccess");
});

exports.addPitchOrganization = functions.https.onCall((data, context) => {
    return addOrganizationBody(data, context, "pitchOrganizations", "userPitches");
});

exports.deletePitchOrganization = functions.https.onCall((data, context) => {
    return deleteOrganizationBody(data, context, "pitchTeams", "userPitches");
});

exports.addPitchTeam = functions.https.onCall((data, context) => {
    return addTeamBody(data, context, "pitchTeams", "userPitches");
});

exports.deletePitchTeam = functions.https.onCall((data, context) => {
    return deleteTeamBody(data, context, "pitchTeams", "userPitches");
});

exports.lastUpdatedPitch = functions.https.onCall((data, context) => {
    return lastUpdatedBody(data, context, "pitches", "userPitches", "pitchAccess", "recentPitchAccess");
});

exports.updatePitchUser = functions.https.onCall((data, context) => {
    return updateBoardUserBody(data, context, "pitches", "userPitches");
});

exports.updatePitchTeamUser = functions.https.onCall((data, context) => {
    return updateTeamUserBody(data, context, "pitchTeams", "userPitches", "pitchAccess");
});

exports.clearPitchUsers = functions.pubsub.schedule('every 60 minutes').onRun((_context) => {
    // it removes users based on the users results from croquet.io/users endpoint
    // let uid = context.auth.uid;

    let accessCollectionRef = admin.firestore().collection("recentPitchAccess");
    let boardCollectionRef = admin.firestore().collection("pitches");

    let processBoard = (boardRef) => {
        return boardRef.get().then((boardDoc) => {
            if (boardDoc.exists) {
                return clearForOneBoard(boardDoc, boardRef, accessCollectionRef);
            }
            return Promise.resolve(null);
        });
    };

    return accessCollectionRef.get().then((querySnapshot) => {
        let promises = [];
        querySnapshot.forEach((recentDoc) => {
            let boardId = recentDoc.id;
            let boardRef = boardCollectionRef.doc(boardId);

            let p = processBoard(boardRef);
            promises.push(p);
        });
        return Promise.all(promises);
    }).then((results) => {
        let filtered = results.filter(v => v);
        console.log(`clearPitchUsers: total: ${results.length}, cleared ${filtered.length}`);
        return results.length;
    });
});

exports.updatePitchPresence = functions.https.onRequest((req, res) => {
    // expects that content-type is application/json
    if (typeof req.body !== "object") {throw new Error("no body in request");}

    let boardId = req.query.room;
    let {time, id, all, left, joined} = req.body;
    if (!boardId || !time || !id || !all || (!left && !joined)) {
        throw new Error("not enough fields");
    }

    res.end("done: " + id);
    return presenceBody("pitches", "recentPitchAccess", id, boardId, time, all, left, joined);
});

exports.updatePresense = functions.https.onRequest((req, res) => {
    // expects that content-type is application/json
    if (typeof req.body !== "object") {throw new Error("no body in request");}

    let boardId = req.query.room;
    let {time, id, all, left, joined} = req.body;
    if (!boardId || !time || !id || !all || (!left && !joined)) {
        throw new Error("not enough fields");
    }

    res.end("done: " + id);
    return presenceBody("boards", null, id, boardId, time, all, left, joined);
});

exports.moveTeamFromOrganization = functions.https.onCall((data, context) => {
    let uid = context.auth.uid;

    console.log("moveTeamToOrganization version 1");

    if (!uid) {
        throw new functions.https.HttpsError("unauthenticated", "not signed in");
    }

    let teamId = data.teamId;
    let oldOrgId = data.oldOrgId;
    let newOrgId = data.newOrgId;

    if (typeof teamId !== "string" ||
        typeof oldOrgId !== "string" ||
        typeof newOrgId !== "string") {
        throw new functions.https.HttpsError("invalid-argument", "parameters are not well typed");
    }

    let teamRef = admin.firestore().collection("teams").doc(teamId);
    let oldOrgRef = admin.firestore().collection("organizations").doc(oldOrgId);
    let newOrgRef = admin.firestore().collection("organizations").doc(newOrgId);

    return admin.firestore().runTransaction((transaction) => {
        return transaction.getAll(teamRef, oldOrgRef, newOrgRef).then(([teamDoc, oldOrgDoc, newOrgDoc]) => {
            let teamData = teamDoc.data();
            let currentOrgId = teamData.orgId;
            let currentTeamOwnerIds = teamData.ownerIds;

            let oldOrgData = oldOrgDoc.data();
            let oldOrgOwnerIds = oldOrgData.ownerIds;

            let newOrgData = newOrgDoc.data();
            let newOrgOwnerIds = newOrgData.ownerIds;

            if (!currentTeamOwnerIds[uid]) {
                throw new Error("no permission");
            }

            if (!currentOrgId !== oldOrgId) {
                throw new Error("no permission");
            }

            if (!oldOrgOwnerIds[uid]) {
                throw new Error("no permission");
            }

            if (!newOrgOwnerIds[uid]) {
                throw new Error("no permission");
            }

            if (currentOrgId !== oldOrgId) {
                throw new Error("team is not in org");
            }

            transaction.update(teamRef, "orgId", newOrgId);
            transaction.update(oldOrgRef, `teams.${teamId}`, FieldValue.delete());
            transaction.set(newOrgRef, {teams: {[teamId]: true}}, {merge: true});
            return {success: "move team from old org to new org", id: teamId};
        });
    });
});
