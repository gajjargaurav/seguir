var _ = require('lodash');

/**
 * This is a collection of methods that allow you to create, update and delete social items.
 *
 * These methods all exclude the 'loggedinuser' parameter as they are all carried out only by
 * the currently logged in user and / or system level calls (e.g. adding a user via integration
 * with an SSO flow).
 *
 * TODO: Exception may be creating a post on someone elses feed.
 *
 */
module.exports = function (api) {

  var client = api.client,
      q = client.queries;

  function addFollower (keyspace, user, user_follower, timestamp, isprivate, ispersonal, backfill, next) {
    if (!next) { next = backfill; backfill = null; }
    var follow = client.generateId();
    var data = [follow, user, user_follower, timestamp, isprivate, ispersonal];
    var object = _.object(['follow', 'user', 'user_follower', 'timestamp', 'isprivate', 'ispersonal'], data);
    client.execute(q(keyspace, 'upsertFollower'), data, {prepare: true}, function (err) {
      /* istanbul ignore if */
      if (err) { return next(err); }
      alterFollowerCount(keyspace, user, 1, function () {
        api.feed.addFeedItem(keyspace, user, object, 'follow', function (err, result) {
          if (err) { return next(err); }
          var follower = {
            follow: follow,
            user: user,
            user_follower: user_follower,
            isprivate: isprivate,
            ispersonal: ispersonal,
            since: timestamp
          };
          api.user.mapUserIdToUser(keyspace, follower, ['user', 'user_follower'], user, function (err, follow) {
            if (err) return next(err);
            if (!backfill) return next(null, follow);
            api.feed.seedFeed(keyspace, user_follower, user, backfill, function (err) {
              if (err) return next(err);
              return next(null, follow);
            });
          });
        });
      });

    });
  }

  function alterFollowerCount (keyspace, user, count, next) {
    next = next || function () {};
    var data = [count, user.toString()];
    client.execute(q(keyspace, 'updateCounter', {TYPE: 'followers'}), data, {prepare: true}, next);
  }

  function followerCount (keyspace, user, next) {
    next = next || function () {};
    var data = [user.toString()];
    client.get(q(keyspace, 'selectCount', {TYPE: 'followers', ITEM: 'user'}), data, {prepare: true}, next);
  }

  function addFollowerByName (keyspace, username, username_follower, timestamp, isprivate, ispersonal, next) {
    api.user.getUserByName(keyspace, username, function (err, user) {
      if (err || !user) { return next(err); }
      api.user.getUserByName(keyspace, username_follower, function (err, follower) {
        if (err || !follower) { return next(err); }
        addFollower(keyspace, user.user, follower.user, timestamp, isprivate, ispersonal, next);
      });
    });
  }

  function removeFollower (keyspace, user, user_follower, next) {
    isFollower(keyspace, user, user_follower, function (err, isFollower, isFollowerSince, follow) {
      if (err || !isFollower) { return next(err); }
      var deleteData = [user, user_follower];
      client.execute(q(keyspace, 'removeFollower'), deleteData, {prepare: true}, function (err, result) {
        if (err) return next(err);
        alterFollowerCount(keyspace, user, -1, function () {
          api.feed.removeFeedsForItem(keyspace, follow.follow, function (err) {
            if (err) return next(err);
            next(null, {status: 'removed'});
          });
        });
      });
    });
  }

  function isFollower (keyspace, user, user_follower, next) {
    if (!user || !user_follower) { return next(null, false, null, null); }
    if (user.toString() === user_follower.toString()) {
      return next(null, true, null, {
        isprivate: false,
        ispersonal: false
      });
    }
    api.common.get(keyspace, 'isFollower', [user, user_follower], 'one', function (err, follow) {
      if (err) { return next(null, false, null, {isprivate: false, ispersonal: false}); }
      var isFollower = !!(follow && follow.follow);
      var isFollowerSince = isFollower ? follow.since : null;
      return next(null, isFollower, isFollowerSince, follow ? follow : null);
    });
  }

  function getFollowFromObject (keyspace, liu, followObject, next) {
    api.friend.userCanSeeItem(keyspace, liu, followObject, ['user', 'user_follower'], function (err) {
      if (err) { return next(err); }
      api.user.mapUserIdToUser(keyspace, followObject, ['user', 'user_follower'], liu, next);
    });
  }

  function getFollow (keyspace, liu, follow, next) {
    api.common.get(keyspace, 'selectFollow', [follow], 'one', function (err, follower) {
      /* istanbul ignore if */
      if (err) { return next(err); }
      api.friend.userCanSeeItem(keyspace, liu, follower, ['user', 'user_follower'], function (err) {
        if (err) { return next(err); }
        api.user.mapUserIdToUser(keyspace, follower, ['user', 'user_follower'], liu, next);
      });
    });
  }

  function getFollowers (keyspace, liu, user, next) {
    var isUser = liu.toString() === user.toString();
    api.friend.isFriend(keyspace, liu, user, function (err, isFriend) {
      if (err) { return next(err); }
      api.common.get(keyspace, 'selectFollowers', [user], 'many', function (err, followers) {
        if (err) { return next(err); }
        var filteredFollowers = _.filter(followers, function (item) {
          if (item.ispersonal && !isUser) { return false; }
          if (item.isprivate && !isFriend) { return false; }
          return true;
        });
        api.user.mapUserIdToUser(keyspace, filteredFollowers, ['user_follower'], user, next);
      });
    });
  }

  function getFollowersByName (keyspace, liu, username, next) {
    api.user.getUserByName(keyspace, username, function (err, user) {
      if (err || !user) { return next(err); }
      getFollowers(keyspace, liu, user.user, function (err, followers) {
        if (err) { return next(err); }
        next(null, followers);
      });
    });
  }

  return {
    addFollower: addFollower,
    addFollowerByName: addFollowerByName,
    removeFollower: removeFollower,
    getFollowers: getFollowers,
    getFollow: getFollow,
    getFollowFromObject: getFollowFromObject,
    isFollower: isFollower,
    getFollowersByName: getFollowersByName,
    followerCount: followerCount
  };

};
