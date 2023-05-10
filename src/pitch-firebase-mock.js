let users = {
    "yoshiki-abc": {
        name: "Yosh Iki", email: "a@b.io", uid: "yoshiki-abc", initials: "AB", photoURL: "https://lh3.googleusercontent.com/a-/AOh14Gj6J7nQOp5pr7QrYS-oeehQTksDrQk2iQj4wPI"},
    "jenn-def": {name: "Jen N", email: "c@b.io", uid: "jenn-def", initials: "CD", photoURL: "https://lh3.googleusercontent.com/a-/AOh14GimUvDEnkSlg9CcaCxV7s4lBxDXDHVT1oqAVUw_=s96-c"},
    "david-ghi": {name: "Dav Id", email: "e@b.io", uid: "david-ghi", initials: "EF", photoURL: "https://lh3.googleusercontent.com/a-/AOh14GhNNrhhG5UlwX66QuFnKy_PyTDMwxwgG7EEVBjXQZxQXEOx-bVb41DkgwUik9_dxRZWEDA-0YCt84XRVr8fzRX9pcR5GbDG5XgDwsro_JrQfVxoxySLDe3KWEvJbd0PbVFsAB54hmuDT4_niovr5m4rHZvBhAKJNrq8LwsrJghy4W18N1yxy9E9rT8s7RpMy9Tr9XKfapFHuXVVwRpVh59g-e2z76vCr7V0-Bpw9JRRMGjEqD-6sSJRWC7k6cNLPD_6cYTguE7vMRKiExbc-VYK_lvorhckP0BHEA2zqZ6o0s_hEH3c4Zaprfhu8hS_NjvZxUjcoPGd0Li-5pweH4_2Qupt7f400xWsTKDazeSNFs0oTAwUHNM9x-ve_YXyM5fi47mdycwGx0EQV-6rAOY3oCflnMwTv13vEQf9RJdtvhfn-qnWyDuZg7xpaRnEtxulUQ0ZCGJ3niPh5Q08wh0sfMBXRuTw2m2iljQ2NslGz1TsVQhAG21hdt31fAuvEt6_OVSEO9cXJwAwy0Y05_jbtjhQTyMn0VjElOpYal8nL081Sak4txgR7P4eJXPc0PPi2PKn6Y68i38uuHU2b22xWUg8NqniewwYbDT0Y8mX9T8O0VF2_0ZVQin_bm9m_qiYyBqUt1Wx8WECUjei4RfeffD5L3Y-R-dUnWdYGVgM-uNjZdS6f28b4L6-ycHU9-wWadY8bcK4tmLtrY_H6wqSx9KiA7D3be-jbQ7h3mlrbztNbR2ibACM8LhSsii8RftjfA=s96-c"}
};

let teamWatchers = {};
let boardWatchers = {};

let teams = {
    "team1": {
        id: "team1",
        boards: {a: true, b: true, c: true},
        lastActivityTime: 1,
        name: "MyTeam1",
        orgId: "yoshiki-abc",
        ownerIds: {"yoshiki-abc": true},
        userIds: {}
    },
    "team2": {
        id: "team2",
        boards: {d: true},
        lastActivityTime: 1,
        name: "MyTeam2",
        orgId: "jenn-def",
        ownerIds: {"jenn-def": true},
        userIds: {"yoshiki-abc": true}
    },
    "yoshiki-abc": {
        id: "yoshiki-abc",
        boards: {uxwb: true},
        lastActivityTime: 1,
        name: "Yoshi ki team",
        orgId: "yoshiki-abc",
        ownerIds: {"yoshiki-abc": true},
        userIds: {"jenn-def": true}
    },
};

/*
let organizations = {
    "yoshiki-abc": {
        billingInfo: "xxxx-xxxx-xxxx-xxxx",
        name: "Yoshiki Ohshima",
        ownerId: "yoshiki-abc",
        ownerIds: {"yoshiki-abc": true},
        teams: {"team1": true}
    },
    "jenn-def": {
        billingInfo: "xxxx-xxxx-xxxx-xxxx",
        name: "Jenn Evans",
        ownerId: "jenn-def",
        ownerIds: {"jenn-def": true},
        teams: {"team2": true}
    }
};

*/

function pitchSchema(name, sessionPassword, ownerId, team) {
    return {
        name,
        sessionPassword,
        ownerId,
        ownerIds: {[ownerId]: true},
        userIds: {},
        team: team || ownerId,
        access: "team", // "private"|"team"|"public"
        activeViewIds: {}, // {viewId: {uid, time}}
    };
}

function initDatabase() {
    return Promise.resolve(users["yoshiki-abc"]);
}

function signOut() {
    let location = window.location;
    let ind = location.pathname.lastIndexOf("/");
    let redirect = `${location.protocol}//${location.host}${location.pathname.slice(0, ind + 1)}login.html`;
    window.location.assign(redirect);
}

function getUser(uid, watcher) {
    if (!uid) {
        uid = "yoshiki-abc";
    }
    let result = users[uid];
    if (watcher) {
        watcher(result);
    }
    return Promise.resolve(result || users["yoshiki-abc"]);
}

function getUserBoards(watcher) {
    let data = {
        boards: {uvwc: true},
        teams: {team1: true, team2: true}
    };

    watcher(data);
    return Promise.resolve(data);
}

function getBoardInfo(boardId, watcher, _errorer) {
    let data;
    if (boardId === "uvwc") {
        data = {
            name: "xyz",
            sessionPassword: "password",
            ownerId: "yoshiki-abc",
            ownerIds: {"yoshiki-abc": true},
            userIds: {"david-ghi": true},
            team: "team1",
            chat: "noChat",
            activeViewIds: {
                "1": {uid: "yoshiki-abc", time: 0, guestName: "Yoshiki Ohshima"},
                /*
                  "2": {uid: "david-ghi", time: 0},
                  "3": {uid: "david-ghi", time: 0},
                  "4": {uid: "jenn-def", time: 0},
                  "5": {uid: "jenn-def", time: 0},
                  "6": {uid: "jenn-def", time: 0},
                  "7": {uid: "yoshiki-abc", time: 0},
                  "8": {uid: "yoshiki-abc", time: 0},
                  "9": {uid: "yoshiki-abc", time: 0},
                  "10": {uid: "yoshiki-abc", time: 0},
                  "11": {uid: "yoshiki-abc", time: 0},
                  "12": {uid: "yoshiki-abc", time: 0},
                  "13": {uid: "yoshiki-abc", time: 0},
                  "14": {uid: "yoshiki-abc", time: 0},
                  "15": {uid: "yoshiki-abc", time: 0},
                  "16": {uid: "yoshiki-abc", time: 0},
                  "17": {uid: "yoshiki-abc", time: 0}
                */},
            id: boardId,
            open: false
        };
    } else {
        data = {
            name: "def",
            sessionPassword: "password",
            ownerId: "jenn-def",
            ownerIds: {"jenn-def": true},
            userIds: {"yoshiki-abc": true, "david-ghi": true},
            team: "team2",
            chat: "default",
            activeViewIds: {
                "1": {uid: "yoshiki-abc", time: 0, guestName: "Yoshiki Ohshima"},
                "2": {uid: "david-ghi", time: 0, guestName: "David Smith"},
                /*
                  "3": {uid: "david-ghi", time: 0},
                  "4": {uid: "jenn-def", time: 0},
                  "5": {uid: "jenn-def", time: 0},
                  "6": {uid: "jenn-def", time: 0},
                  "7": {uid: "yoshiki-abc", time: 0},
                  "8": {uid: "yoshiki-abc", time: 0},
                  "9": {uid: "yoshiki-abc", time: 0},
                  "10": {uid: "yoshiki-abc", time: 0},
                  "11": {uid: "yoshiki-abc", time: 0},
                  "12": {uid: "yoshiki-abc", time: 0},
                  "13": {uid: "yoshiki-abc", time: 0},
                  "14": {uid: "yoshiki-abc", time: 0},
                  "15": {uid: "yoshiki-abc", time: 0},
                  "16": {uid: "yoshiki-abc", time: 0},
                  "17": {uid: "yoshiki-abc", time: 0}*/},
            id: boardId,
            open: false
        };
    }

    if (watcher) {
        if (!boardWatchers[boardId]) {
            watcher(data);
        }
        boardWatchers[boardId] = watcher;
    }
    return Promise.resolve(data);
}

function updateBoardInfo(_boardId, _newValues) {}

function addBoard(name, _teamId, _watcher) {
    let obj = pitchSchema(name, "abc", "yoshiki-abc");
    obj.data = {success: "addBoardFor team", id: "idxxxid"};
    return Promise.resolve(obj);
}

function updateTeamInfo(teamId, newValues) {
    console.log("update Team Info", newValues);
    return Promise.resolve(newValues);
}

function getTeamInfo(teamId, watcher, _errorer) {
    let team = teams[teamId];
    if (!teamWatchers[teamId]) {
        if (watcher) {
            watcher(team);
        }
        teamWatchers[teamId] = watcher;
    }
    return Promise.resolve(team);
}

function forgetTeam(teamId) {
    console.log("forgetTeam", teamId);
}

function addTeam(name, _watcher) {
    console.log("addTeam", name);
}

function lookupUserFromEmail(email) {
    for (let k in users) {
        let entry = users[k];
        if (entry.email === email) {
            return Promise.resolve(entry);
        }
    }
    return Promise.resolve(null);
}

function getEmailForUser(userId) {
    return users[userId].email || "x@b.io";
}

function postLastUpdated(data) {
    console.log("lastUpdated", data);
}

function updateBoardUser(data) {
    console.log(data);
}

function updateTeamUser(data) {
    console.log(data);
}

function deleteBoard(data) {
    console.log("delete board:", data);
    return Promise.resolve({data: {id: data.boardId}});
}

function deleteTeam(data) {
    console.log(`delete team: ${data}`);
}

function forgetBoard(boardId) {
    console.log("forgetBoard " + boardId);
}

function forgetAllBoards() {
    console.log("forgetAllBoards");
}

function forgetAllSubscriptions() {
    console.log("forgetAllSubscriptions");
}

function emailsStartsWith(str) {
    let result = Object.keys(users)
        .filter((key) => users[key].email.startsWith(str))
        .map((key) => ({email: users[key].email, uid: users[key].uid}));
    return Promise.resolve(result);
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

    forgetBoard,
    forgetAllBoards,
    forgetAllSubscriptions,
    forgetTeam,
};
