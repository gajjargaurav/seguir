var restify = require('restify');
var u = require('../api/urls');
var bunyan = require('bunyan');
var _ = require('lodash');

var defaultLogger = bunyan.createLogger({
    name: 'seguir',
    serializers: restify.bunyan.serializers
});

function bootstrapServer (api, config, next) {

  var server = restify.createServer({
    name: 'seguir',
    version: '0.1.0',
    log: config.logger || defaultLogger
  });

  // Default middleware
  server.use(restify.bodyParser({mapParams: true}));
  server.use(restify.queryParser({ mapParams: false }));
  server.use(restify.gzipResponse());
  server.use(restify.CORS());

  // Logging
  server.on('after', function (request, response, route, error) {
    var fn = error ? 'error' : 'info';
    if (api.config.logging) {
      request.log[fn]({req: request, res: response, route: route, err: error}, 'request');
    }
  });

  server.get(/\/docs\/current\/?.*/, restify.serveStatic({
    directory: './doc',
    default: 'index.html'
  }));

  server.get('/status', function (req, res, cb) {
    api.auth.getAccounts(function (err, accounts) {
      if (err) { return _error(err); }
      var statusConfig = _.clone(config);
      delete statusConfig.logger;
      res.send({status: 'OK', config: statusConfig, accounts: accounts});
      cb();
    });
  });

  // Preflight
  server.pre(restify.pre.sanitizePath());
  server.pre(restify.pre.userAgentConnection());

  server.get('/', api.auth.checkRequest, function (req, res, cb) {
    res.send({status: 'Seguir - OK'});
    cb();
  });

  var coerce = api.auth.coerceUserToUuid;

  function _error (err) {
    return new restify.HttpError(err);
  }

  function _response (res, next) {
    return function (err, result) {
      if (err) { return next(_error(err)); }
      res.send(result);
      next();
    };
  }

  /**
   * @apiDefine ApiUsers Users
   * This is a collection of methods that allow you to create and retrieve users.
   */

  /**
   * @api {post} /user/:user Update a user
   * @apiName Users
   * @apiGroup ApiUsers
   * @apiVersion 1.0.0
   *
   * @apiDescription Updates a user.
   * @apiParam {String} user the guid or altid of the user
   * @apiParam {String} username the name of the user
   * @apiParam {String} altid the alternate ID of the user
   * @apiParam {Object} userdata arbitrary user data
   *
   *  @apiUse MissingUsername
   *  @apiUse ServerError
   *  @apiUse updateUserSuccessExample
   */
  server.post(u('updateUser'), api.auth.checkRequest, function (req, res, next) {
    coerce(req.keyspace, req.params.user, function (err, user) {
      if (err) { return next(_error(err)); }
      if (!req.params.username) {
        return next(new restify.InvalidArgumentError('You must provide a username.'));
      }
      api.user.updateUser(req.keyspace, user, req.params.username, req.params.altid, req.params.userdata, _response(res, next));
    });
  });

  /**
   * @api {get} /username/:username Get a specific user
   * @apiName GetUser
   * @apiGroup ApiUsers
   * @apiVersion 1.0.0
   *
   * @apiDescription Retrieves details of a specific user
   *
   * @apiExample {curl} Example usage:
   *     curl -i http://localhost:3000/username/cliftonc
   *
   * @apiParam {String} username The name of the user
   *
   *  @apiUse getUserByNameSuccessExample
   *  @apiUse UserNotFound
   *  @apiUse ServerError
   *
   */
  server.get(u('getUserByName'), api.auth.checkRequest, function (req, res, next) {
    api.user.getUserByName(req.keyspace, req.params.username, _response(res, next));
  });

  /**
   * @api {post} /user Add a user
   * @apiName Users
   * @apiGroup ApiUsers
   * @apiVersion 1.0.0
   *
   * @apiDescription Creates a new user.
   * @apiParam {String} username the name of the user
   * @apiParam {String} altid the alternate ID of the user
   * @apiParam {Object} userdata arbitrary user data
   * @apiParam {Object} initialise initialisation command
   *
   * @apiParamExample {json} userdata
   *  {
        avatar: '/image/1.jpg',
        fullName: 'Clifton Cunningham'
      }
   *
   * @apiParamExample {json} initialise
   *  {
        follow: {
          users: ['bob', 'cliftonc'],
          backfill: '1d',
          isprivate: false,
          ispersonal: true
        }
      }
   *
   * @apiExample {curl} Example usage:
   *     curl --data 'username=cliftonc' http://localhost:3000/user
   *
   *  @apiUse MissingUsername
   *  @apiUse ServerError
   *  @apiUse addUserSuccessExample
   */
  server.post(u('addUser'), api.auth.checkRequest, function (req, res, next) {
    if (!req.params.username) {
      return next(new restify.InvalidArgumentError('You must provide a username.'));
    }
    api.user.addUser(req.keyspace, req.params.username, req.params.altid, req.params.userdata, req.params.initialise, _response(res, next));
  });

  /**
   * @api {get} /user/:id Get a specific user by id
   * @apiName GetUser
   * @apiGroup ApiUsers
   * @apiVersion 1.0.0
   *
   * @apiDescription Retrieves details of a specific user by id
   *
   * @apiExample {curl} Example usage:
   *     curl -i http://localhost:3000/user/cbeab41d-2372-4017-ac50-d8d63802d452
   *
   * @apiParam {String} user The id of the user
   * @apiUse getUserSuccessExample
   *
   *  @apiUse UserNotFound
   *  @apiUse ServerError
   *
   */
  server.get(u('getUser'), api.auth.checkRequest, function (req, res, next) {
    coerce(req.keyspace, req.params.user, function (err, user) {
      if (err) { return next(_error(err)); }
      if (!user) { return next(_error({statusCode: 404, message: 'User not found'})); }
      api.user.getUser(req.keyspace, user, _response(res, next));
    });
  });

  /**
   * @api {get} /useraltid/:id Get a specific user by altid
   * @apiName GetUser
   * @apiGroup ApiUsers
   * @apiVersion 1.0.0
   *
   * @apiDescription Retrieves details of a specific user by altid
   *
   * @apiExample {curl} Example usage:
   *     curl -i http://localhost:3000/useraltid/1234
   *
   * @apiParam {String} id The alternate id of the user as a string
   * @apiUse getUserByAltIdSuccessExample
   *
   *  @apiUse UserNotFound
   *  @apiUse ServerError
   *
   */
  server.get(u('getUserByAltId'), api.auth.checkRequest, function (req, res, next) {
    api.user.getUserByAltId(req.keyspace, req.params.altid, _response(res, next));
  });

  /**
   * @api {get} /user/:id/relationship Get details of a relationship
   * @apiName GetUserRelationship
   * @apiGroup ApiUsers
   * @apiVersion 1.0.0
   *
   * @apiDescription
   *
   * Retrieves details of a specific user relationship with the current logged in user, intended to be used
   * when viewing someone elses profile.
   *
   * @apiExample {curl} Example usage:
   *     curl -i http://localhost:3000/user/cbeab41d-2372-4017-ac50-d8d63802d452/relationship
   *
   * @apiParam {String} user The id of the user
   * @apiUse getUserRelationshipSuccessExample
   *
   *  @apiUse UserNotFound
   *  @apiUse ServerError
   *
   */
  server.get(u('getUserRelationship'), api.auth.checkRequest, function (req, res, next) {
    coerce(req.keyspace, req.params.user, function (err, user) {
      if (err) { return next(_error(err)); }
      api.user.getUserRelationship(req.keyspace, req.liu.user, user, _response(res, next));
    });
  });

  /**
   * @apiDefine ApiLikes Likes
   *
   * This is a collection of methods that allow you to create and retrieve likes.
   */

  /**
   * @api {post} /like Add a like by a user
   * @apiName AddLike
   * @apiGroup ApiLikes
   * @apiVersion 1.0.0
   *
   * @apiDescription Creates a new like of an item
   *
   * @apiExample {curl} Example usage:
   *     curl --data 'user=405d7e5e-c028-449c-abad-9c11d8569b8f&item=github.com' http://localhost:3000/like
   *
   * @apiParam {Guid} user the guid representation of the user
   * @apiParam {String} item a canonical url to the item liked
   * @apiUse addLikeSuccessExample
   *
   *  @apiUse MissingUsername
   *  @apiUse MissingItem
   *  @apiUse UserNotFound
   *  @apiUse ServerError
   */
  server.post(u('addLike'), api.auth.checkRequest, function (req, res, next) {
    if (!req.params.user) {
      return next(new restify.InvalidArgumentError('You must provide a user.'));
    }
    if (!req.params.item) {
      return next(new restify.InvalidArgumentError('You must provide an item.'));
    }
    coerce(req.keyspace, req.params.user, function (err, user) {
      if (err) { return next(_error(err)); }
      api.like.addLike(req.keyspace, user, req.params.item, api.client.getTimestamp(), _response(res, next));
    });
  });

  /**
   * @api {get} /like/:like Get a specific like
   * @apiName GetLike
   * @apiGroup ApiLikes
   * @apiVersion 1.0.0
   *
   * @apiDescription Retrieves details of a specific like
   *
   * @apiExample {curl} Example usage:
   *     curl -i http://localhost:3000/like/405d7e5e-c028-449c-abad-9c11d8569b8f/github.com
   *
   * @apiParam {Guid} post The guid of the like
   * @apiUse getLikeSuccessExample
   *
   *  @apiUse ServerError
   *
   */
  server.get(u('getLike'), api.auth.checkRequest, function (req, res, next) {
    api.like.getLike(req.keyspace, req.params.like, _response(res, next));
  });

  /**
   * @api {get} /user/:user/like/:item Check a specific like
   * @apiName CheckLike
   * @apiGroup ApiLikes
   * @apiVersion 1.0.0
   *
   * @apiDescription Checks if a user likes a specific item, typically the item is a canonical url.
   *
   * @apiExample {curl} Example usage:
   *     curl -i http://localhost:3000/like/405d7e5e-c028-449c-abad-9c11d8569b8f/github.com
   *
   * @apiParam {Guid} user The guid of the user
   * @apiParam {String} item The item to check
   * @apiUse checkLikeSuccessExample
   *
   *  @apiUse UserNotFound
   *  @apiUse ServerError
   *
   */
  server.get(u('checkLike'), api.auth.checkRequest, function (req, res, next) {
    coerce(req.keyspace, req.params.user, function (err, user) {
      if (err) { return next(_error(err)); }
      api.like.checkLike(req.keyspace, user, encodeURIComponent(req.params.item), _response(res, next));
    });
  });

  /**
   * @api {delete} /user/:user/like/:item Remove a like.
   * @apiName RemoveLike
   * @apiGroup ApiLikes
   * @apiVersion 1.0.0
   *
   * @apiDescription Removes a like
   * @apiParam {Guid} user The guid of the user
   * @apiParam {String} item The item to check
   * @apiUse removeLikeSuccessExample
   *
   *  @apiUse UserNotFound
   *  @apiUse ServerError
   */
  server.del(u('removeLike'), api.auth.checkRequest, function (req, res, next) {
    if (!req.params.user) {
      return next(new restify.InvalidArgumentError('You must provide a user.'));
    }
    if (!req.params.item) {
      return next(new restify.InvalidArgumentError('You must provide an item.'));
    }
    coerce(req.keyspace, req.params.user, function (err, user) {
      if (err) { return next(_error(err)); }
      if (req.liu.user.toString() !== user.toString()) {
        return next(new restify.ForbiddenError('You cant delete someone elses like.'));
      }
      api.like.removeLike(req.keyspace, req.liu.user, encodeURIComponent(req.params.item), _response(res, next));
    });
  });

  /**
   * @apiDefine ApiPosts Posts
   *
   * This is a collection of methods that allow you to create and retrieve posts.
   */

  /**
   * @api {post} /post Add a post by a user
   * @apiName AddPost
   * @apiGroup ApiPosts
   * @apiVersion 1.0.0
   *
   * @apiDescription Creates a new post, by default all new posts are public, and so can be seen by all users.
   * @apiParam {String} user of the user
   * @apiParam {String} content of the post
   * @apiParam {String} content_type the type of content in content, use application/json for json data, defaults to text/html
   * @apiParam {Timestamp} posted the timestamp that the post occurred - default Date.now()
   * @apiParam {Boolean} private is the post private, e.g. only for friends
   * @apiParam {Boolean} private is the post personal, e.g. only for you
   * @apiUse addPostSuccessExample
   *
   *  @apiUse MissingUser
   *  @apiUse MissingContent
   *  @apiUse ServerError
   */
  server.post(u('addPost'), api.auth.checkRequest, function (req, res, next) {

    if (!req.params.user) {
      return next(new restify.InvalidArgumentError('You must provide a user.'));
    }
    if (!req.params.content) {
      return next(new restify.InvalidArgumentError('You must provide content for the post.'));
    }
    var isprivate = !!req.params.isprivate,
        ispersonal = !!req.params.ispersonal,
        content_type = req.params.content_type || 'text/html',
        posted = api.client.getTimestamp(req.params.posted);

    coerce(req.keyspace, req.params.user, function (err, user) {
      if (err) { return next(_error(err)); }
      api.post.addPost(req.keyspace, user, req.params.content, content_type, posted, isprivate, ispersonal, _response(res, next));
    });
  });

  /**
   * @api {get} /post/:post Get a specific post
   * @apiName GetPost
   * @apiGroup ApiPosts
   * @apiVersion 1.0.0
   *
   * @apiDescription Retrieves details of a specific post
   * @apiParam {Guid} post The guid of the post
   * @apiUse getPostSuccessExample
   *
   *  @apiUse ServerError
   */
  server.get(u('getPost'), api.auth.checkRequest, function (req, res, next) {
    api.post.getPost(req.keyspace, req.liu.user, req.params.post, _response(res, next));
  });

  /**
   * @api {delete} /post/:post Remove a post.
   * @apiName RemovePost
   * @apiGroup ApiPosts
   * @apiVersion 1.0.0
   *
   * @apiDescription Removes a post
   * @apiParam {String} post the guid representation of the post
   * @apiUse removePostSuccessExample
   *
   *  @apiUse MissingPost
   *  @apiUse ServerError
   */
  server.del(u('removePost'), api.auth.checkRequest, function (req, res, next) {
    if (!req.params.post) {
      return next(new restify.InvalidArgumentError('You must provide a post guid.'));
    }
    api.post.removePost(req.keyspace, req.liu.user, req.params.post, _response(res, next));
  });

 /**
   * @api {get} /friend/:friend Get friend
   * @apiName GetFriend
   * @apiGroup ApiFriends
   * @apiVersion 1.0.0
   *
   * @apiDescription Retrieves a specific relationship information
   * @apiParam {String} user the guid of the user
   * @apiUse getFriendSuccessExample
   *
   *  @apiUse UserNotFound
   *  @apiUse ServerError
   *
   */
  server.get(u('getFriend'), api.auth.checkRequest, function (req, res, next) {
    coerce(req.keyspace, req.params.friend, function (err, friend) {
      if (err) { return next(_error(err)); }
      api.friend.getFriend(req.keyspace, req.liu.user, friend, _response(res, next));
    });
  });

  /**
   * @api {get} /user/:user/friends Get friends for a user
   * @apiName GetFriends
   * @apiGroup ApiFriends
   * @apiVersion 1.0.0
   *
   * @apiDescription Retrieves a set of friends for a specific user
   * @apiParam {String} user the guid of the user
   * @apiUse getFriendsSuccessExample
   *  @apiUse UserNotFound
   *  @apiUse ServerError
   *
   */
  server.get(u('getFriends'), api.auth.checkRequest, function (req, res, next) {
    coerce(req.keyspace, req.params.user, function (err, user) {
      if (err) { return next(_error(err)); }
      api.friend.getFriends(req.keyspace, req.liu.user, user, _response(res, next));
    });
  });

/**
   * @api {delete} /user/:user/friend/:user_friend Remove a friendship.
   * @apiName RemoveFriend
   * @apiGroup ApiFriends
   * @apiVersion 1.0.0
   *
   * @apiDescription Removes a friendship (both sides)
   * @apiParam {String} user the guid representation of the user
   * @apiParam {String} user_friend the guid representation of the user they dont want to be friends with
   * @apiUse removeFriendSuccessExample
   *  @apiUse MissingUser
   *  @apiUse MissingFriend
   *  @apiUse ServerError
   */
  server.del(u('removeFriend'), api.auth.checkRequest, function (req, res, next) {
    if (!req.params.user) {
      return next(new restify.InvalidArgumentError('You must provide a user guid.'));
    }
    if (!req.params.user_friend) {
      return next(new restify.InvalidArgumentError('You must provide a user_friend guid.'));
    }
    coerce(req.keyspace, [req.params.user, req.params.user_friend], function (err, users) {
      if (err) { return next(_error(err)); }
      var user = users[0], user_friend = users[1];
      if (user.toString() !== req.liu.user.toString()) {
        return next(new restify.ForbiddenError('You can only remove your own friendships.'));
      }
      api.friend.removeFriend(req.keyspace, user, user_friend, _response(res, next));
    });
  });

/**
   * @apiDefine ApiFriendRequests Friend Requests
   *
   * This is a collection of methods that allow you to use the friend request workflow (instead of creating friends automatically).
   */
  /**
   * @api {post} /friend-request Submit a new friend request
   * @apiName AddFriendRequest
   * @apiGroup ApiFriendRequests
   * @apiVersion 1.0.0
   *
   * @apiDescription Adds a new friend request.
   * @apiParam {String} user_friend the guid of the user to become friends with
   * @apiParam {String} message the message to leave
   * @apiUse addFriendRequestSuccessExample
   *
   *  @apiUse MissingUser
   *  @apiUse MissingFriend
   *  @apiUse ServerError
   */
  server.post(u('addFriendRequest'), api.auth.checkRequest, function (req, res, next) {
    if (!req.params.user_friend) {
      return next(new restify.InvalidArgumentError('You must provide a user_friend id.'));
    }
    coerce(req.keyspace, req.params.user_friend, function (err, user_friend) {
      if (err) { return next(_error(err)); }
      api.friend.addFriendRequest(req.keyspace, req.liu.user, user_friend, req.params.message || '', api.client.getTimestamp(), _response(res, next));
    });
  });

  /**
   * @api {get} /friend-request/active Get active friend requests
   * @apiName GetFriendRequests
   * @apiGroup ApiFriendRequests
   * @apiVersion 1.0.0
   *
   * @apiDescription Retrieves active friend Requests for logged in user (inbound and outbound)
   * @apiUse getFriendRequestsSuccessExample
   *
   *  @apiUse UserNotFound
   *  @apiUse ServerError
   *
   */
  server.get(u('getFriendRequests'), api.auth.checkRequest, function (req, res, next) {
    if (!req.liu.user) {
      return next(new restify.UnauthorizedError('You must be logged in to access a friend request list.'));
    }
    api.friend.getFriendRequests(req.keyspace, req.liu.user, _response(res, next));
  });

  /**
   * @api {post} /friend-request/accept Accept a friend request
   * @apiName AcceptFriendRequest
   * @apiGroup ApiFriendRequests
   * @apiVersion 1.0.0
   *
   * @apiDescription Accepts a friend request.
   * @apiParam {String} friend_request the guid of the user to become friends with
   * @apiUse acceptFriendRequestSuccessExample

   *  @apiUse MissingUser
   *  @apiUse MissingFriend
   *  @apiUse ServerError
   */
  server.post(u('acceptFriendRequest'), api.auth.checkRequest, function (req, res, next) {
    if (!req.params.friend_request) {
      return next(new restify.InvalidArgumentError('You must provide a friend_request guid.'));
    }
    api.friend.acceptFriendRequest(req.keyspace, req.liu.user, req.params.friend_request, _response(res, next));
  });

   /**
   * @apiDefine ApiFollowers Followers
   *
   * This is a collection of methods that allow you to create and retrieve follows.
   */

  /**
   * @api {post} /follow Add a follower to a user
   * @apiName AddFollower
   * @apiGroup ApiFollowers
   * @apiVersion 1.0.0
   *
   * @apiDescription Adds a new friend to a user account.
   * @apiParam {Guid} user the guid representation of the user who will be followed
   * @apiParam {Guid} user_follower the guid of the user who will be the follower
   * @apiParam {Boolean} isprivate is the follow private, e.g. only for friends
   * @apiParam {Boolean} ispersonal is the follow personal, e.g. only for you
   * @apiParam {String} backfill amount of time to backfill posts from the user followed - e.g. 1d
   * @apiUse followUserSuccessExample
   *
   *  @apiUse MissingUsername
   *  @apiUse MissingFollow
   *  @apiUse ServerError
   */
  server.post(u('addFollower'), api.auth.checkRequest, function (req, res, next) {
    if (!req.params.user) {
      return next(new restify.InvalidArgumentError('You must provide a user.'));
    }
    if (!req.params.user_follower) {
      return next(new restify.InvalidArgumentError('You must provide a user_follower.'));
    }

    var isprivate = !!req.params.isprivate,
        ispersonal = !!req.params.ispersonal,
        backfill = req.params.backfill;

    coerce(req.keyspace, [req.params.user, req.params.user_follower], function (err, users) {
      if (err) { return next(_error(err)); }
      var user = users[0], user_follower = users[1];

      if (user_follower.toString() !== req.liu.user.toString()) {
        return next(new restify.ForbiddenError('You can only add your own follow relationships.'));
      }

      api.follow.addFollower(req.keyspace, user, user_follower, api.client.getTimestamp(), isprivate, ispersonal, backfill, _response(res, next));
    });

  });

  /**
   * @api {get} /user/:user/followers Get followers for a user
   * @apiName GetFollowers
   * @apiGroup ApiFollowers
   * @apiVersion 1.0.0
   *
   * @apiDescription Retrieves a set of feed items for a specific user
   * @apiParam {String} username the username of the user
   * @apiUse getFollowersSuccessExample
   *  @apiUse UserNotFound
   *  @apiUse ServerError
   *
   */
  server.get(u('getFollowers'), api.auth.checkRequest, function (req, res, next) {
    coerce(req.keyspace, req.params.user, function (err, user) {
      if (err) { return next(_error(err)); }
      api.follow.getFollowers(req.keyspace, req.liu.user, user, _response(res, next));
    });
  });

  /**
   * @api {get} /followers/:follow Get follow details
   * @apiName GetFollower
   * @apiGroup ApiFollowers
   * @apiVersion 1.0.0
   *
   * @apiDescription Retrieves details of a specific follow
   * @apiParam {Guid} follow the guid of a specific follow
   * @apiUse getFollowSuccessExample
   *
   *  @apiUse ServerError
   *
   */
  server.get(u('getFollow'), api.auth.checkRequest, function (req, res, next) {
    api.follow.getFollow(req.keyspace, req.liu.user, req.params.follow, _response(res, next));
  });

  /**
   * @api {delete} /user/:user/follower/:user_follower Stop following a user.
   * @apiName RemoveFollower
   * @apiGroup ApiFollowers
   * @apiVersion 1.0.0
   *
   * @apiDescription Removes a follow
   * @apiParam {String} user the user guid who is currently being followed
   * @apiParam {String} user_follower the user who will stop following the first user
   * @apiUse unFollowUserSuccessExample
   *  @apiUse MissingUser
   *  @apiUse MissingFollow
   *  @apiUse ServerError
   */
  server.del(u('removeFollower'), api.auth.checkRequest, function (req, res, next) {

    if (!req.params.user) {
      return next(new restify.InvalidArgumentError('You must provide a user id.'));
    }
    if (!req.params.user_follower) {
      return next(new restify.InvalidArgumentError('You must provide a user_follower id.'));
    }

    coerce(req.keyspace, [req.params.user, req.params.user_follower], function (err, users) {

      if (err) { return next(_error(err)); }
      var user = users[0], user_follower = users[1];

      if (user_follower.toString() !== req.liu.user.toString()) {
        return next(new restify.ForbiddenError('You can only remove your own follow relationships.'));
      }
      api.follow.removeFollower(req.keyspace, user, user_follower, _response(res, next));

    });

  });

   /**
   * @apiDefine ApiFeeds Feeds
   *
   * This is a collection of methods that allow you to retrieve the news feed for a user.
   */

  /**
   * @api {get} /feed/:user Get a feed for a user
   * @apiName GetFeed
   * @apiGroup ApiFeeds
   * @apiVersion 1.0.0
   *
   * @apiDescription Retrieves a set of feed items for a specific user
   * @apiParam {String} user the guid of the user
   * @apiUse getFeedSuccessExample
   *  @apiUse UserNotFound
   *  @apiUse ServerError
   *
   */
  server.get(u('getFeed'), api.auth.checkRequest, function (req, res, next) {
    var start = req.query.start || null;
    var limit = +req.query.limit || 50;
    coerce(req.keyspace, req.params.user, function (err, user) {
      if (err) { return next(_error(err)); }
      if (!user) { return next(_error({statusCode: 404, message: 'User ' + req.params.user + ' not found!'})); }
      api.feed.getFeed(req.keyspace, req.liu.user, user, start, limit, function (err, feed, more) {
        if (err) { return next(_error(err)); }
        res.send({feed: feed, more: more});
      });
    });
  });

 /**
   * @api {get} /feed/:user/direct Get a direct feed for a user
   * @apiName GetFeedDirect
   * @apiGroup ApiFeeds
   * @apiVersion 1.0.0
   *
   * @apiDescription Retrieves a set of feed items for a specific user that are directly posted to their feed, so not including items that come via follows or mentions.
   * @apiParam {String} user the guid of the user
   * @apiUse getUserFeedSuccessExample
   *
   *  @apiUse UserNotFound
   *  @apiUse ServerError
   *
   */
  server.get(u('getUserFeed'), api.auth.checkRequest, function (req, res, next) {
    var start = req.query.start || null;
    var limit = +req.query.limit || 50;
    coerce(req.keyspace, req.params.user, function (err, user) {
      if (err) { return next(_error(err)); }
      if (!user) { return next(_error({statusCode: 404, message: 'User ' + req.params.user + ' not found!'})); }
      api.feed.getUserFeed(req.keyspace, req.liu.user, user, start, limit, function (err, feed, more) {
        if (err) { return next(_error(err)); }
        res.send({feed: feed, more: more});
      });
    });
  });

  next(null, server);

}

/* istanbul ignore if */
if (require.main === module) {

  var config = require('./config')();
  require('../api')(config, function (err, api) {
    if (err) { return process.exit(0); }
    bootstrapServer(api, config, function (err, server) {
      if (err) {
        console.log('Unable to bootstrap server: ' + err.message);
        return;
      }
      server.listen(config.port || 3000, function () {
        console.log('Server %s listening at %s', server.name, server.url);
      });
    });
  });

} else {
  module.exports = function (config, next) {
    require('../api')(config, function (err, api) {
      if (err) {
        return next(new Error('Unable to bootstrap API: ' + err.message));
      }
      return bootstrapServer(api, config, next);
    });
  };
}

/**
 * @apiDefine MissingUser
 * @apiError (4xx) BadRequestError You did not provide a guid for the user
 * @apiErrorExample Bad-Request:
 *     HTTP/1.1 400 Bad Request
 *     {
 *       'code': 'BadRequestError',
 *       'message': 'You must provide a user guid.'
 *     }
 */

/**
 * @apiDefine MissingUsername
 * @apiError (4xx) BadRequestError You did not provide a username
 * @apiErrorExample Bad-Request:
 *     HTTP/1.1 400 Bad Request
 *     {
 *       'code': 'BadRequestError',
 *       'message': 'You must provide a username.'
 *     }
 */

/**
 * @apiDefine MissingPost
 * @apiError (4xx) BadRequestError You did not provide a post guid
 * @apiErrorExample Bad-Request:
 *     HTTP/1.1 400 Bad Request
 *     {
 *       'code': 'BadRequestError',
 *       'message': 'You must provide a post guid.'
 *     }
 */

/**
 * @apiDefine MissingFriend
 * @apiError (4xx) BadRequestError You did not provide a friend guid
 * @apiErrorExample Bad-Request:
 *     HTTP/1.1 400 Bad Request
 *     {
 *       'code': 'BadRequestError',
 *       'message': 'You must provide a friend guid.'
 *     }
 */

/**
 * @apiDefine MissingFollow
 * @apiError (4xx) BadRequestError You did not provide a follow guid
 * @apiErrorExample Bad-Request:
 *     HTTP/1.1 400 Bad Request
 *     {
 *       'code': 'BadRequestError',
 *       'message': 'You must provide a follow guid.'
 *     }
 */

/**
 * @apiDefine MissingItem
 * @apiError (4xx) BadRequestError You did not provide an item to check
 * @apiErrorExample Bad-Request:
 *     HTTP/1.1 400 Bad Request
 *     {
 *       'code': 'BadRequestError',
 *       'message': 'You must provide an item.'
 *     }
 */

/**
 * @apiDefine MissingContent
 * @apiError (4xx) BadRequestError You did not provide content for the post
 * @apiErrorExample Bad-Request:
 *     HTTP/1.1 400 Bad Request
 *     {
 *       'code': 'BadRequestError',
 *       'message': 'You must provide content for the post.'
 *     }
 */

/**
 * @apiDefine UserNotFound
 * @apiError (4xx) NotFoundError The user was not found.
 * @apiErrorExample Not-Found:
 *     HTTP/1.1 404 Not Found
 *     {
 *       'code': 'NotFoundError',
 *       'message': 'Could not find that user.'
 *     }
 */

/**
 * @apiDefine ServerError
 * @apiError (5xx) ServerError There was a server problem.
 * @apiErrorExample Server-Error:
 *     HTTP/1.1 500 Server Error
 *     {
 *       'code': 'NotFoundError',
 *       'message': 'Something specific about the server error'
 *     }
 */

// MARKER: Samples
/**
 * @apiDefine addUserSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "user": "ed3d35af-68c5-43bd-b872-dccc5687bb6a",
  "username": "cliftonc",
  "altid": "1",
  "userdata": {
    "avatar": "test.jpg"
  }
}
 */
/**
 * @apiDefine getUserSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "user": "ed3d35af-68c5-43bd-b872-dccc5687bb6a",
  "username": "cliftonc",
  "altid": "1",
  "userdata": {
    "avatar": "test.jpg"
  }
}
 */
/**
 * @apiDefine getUserByNameSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "user": "0ac0af3d-079a-44d8-a608-8dc66e1c59a1",
  "username": "evil &user <alert>name</alert>",
  "altid": "9",
  "userdata": {
    "avatar": "test.jpg"
  }
}
 */
/**
 * @apiDefine getUserByAltIdSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "user": "ed3d35af-68c5-43bd-b872-dccc5687bb6a",
  "username": "cliftonc",
  "altid": "1",
  "userdata": {
    "avatar": "test.jpg"
  }
}
 */
/**
 * @apiDefine updateUserSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "user": "79e96603-6048-42d1-9944-3d720128d3ad",
  "username": "new_name",
  "altid": "new_altid",
  "userdata": {
    "hello": "world"
  }
}
 */
/**
 * @apiDefine addFriendRequestSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "friend_request": "2bc5c7e5-b31b-4cbf-807f-f5329467bba7",
  "user": "ed3d35af-68c5-43bd-b872-dccc5687bb6a",
  "user_friend": "39f9f9be-c426-4947-a861-c9942470f4cf",
  "message": "Please be my friend",
  "since": "2015-06-30T09:19:34.338Z"
}
 */
/**
 * @apiDefine getFriendRequestsSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "incoming": [],
  "outgoing": [
    {
      "friend_request": "2bc5c7e5-b31b-4cbf-807f-f5329467bba7",
      "user": {
        "user": "ed3d35af-68c5-43bd-b872-dccc5687bb6a",
        "username": "cliftonc",
        "altid": "1",
        "userdata": {
          "avatar": "test.jpg"
        }
      },
      "user_friend": {
        "user": "39f9f9be-c426-4947-a861-c9942470f4cf",
        "username": "phteven",
        "altid": "2",
        "userdata": {
          "avatar": "test.jpg"
        }
      },
      "message": "Please be my friend",
      "since": "2015-06-30T09:19:34.338Z"
    }
  ]
}
 */
/**
 * @apiDefine acceptFriendRequestSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "friend": "44d2f4e5-be2a-49e4-8e3e-7bece78d1276",
  "reciprocal": "fa0da3ab-080f-443f-a2c3-c48e95dc3bad",
  "user": {
    "user": "ed3d35af-68c5-43bd-b872-dccc5687bb6a",
    "username": "cliftonc",
    "altid": "1",
    "userdata": {
      "avatar": "test.jpg"
    }
  },
  "user_friend": {
    "user": "39f9f9be-c426-4947-a861-c9942470f4cf",
    "username": "phteven",
    "altid": "2",
    "userdata": {
      "avatar": "test.jpg"
    }
  },
  "since": "2015-06-30T09:19:34.374Z"
}
 */
/**
 * @apiDefine getFriendSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "friend": "44d2f4e5-be2a-49e4-8e3e-7bece78d1276",
  "user": {
    "user": "ed3d35af-68c5-43bd-b872-dccc5687bb6a",
    "username": "cliftonc",
    "altid": "1",
    "userdata": {
      "avatar": "test.jpg"
    }
  },
  "user_friend": {
    "user": "39f9f9be-c426-4947-a861-c9942470f4cf",
    "username": "phteven",
    "altid": "2",
    "userdata": {
      "avatar": "test.jpg"
    }
  },
  "since": "2015-06-30T09:19:34.374Z"
}
 */
/**
 * @apiDefine getFriendsSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
[
  {
    "user_friend": {
      "user": "39f9f9be-c426-4947-a861-c9942470f4cf",
      "username": "phteven",
      "altid": "2",
      "userdata": {
        "avatar": "test.jpg"
      }
    },
    "since": "2015-06-30T09:19:34.374Z"
  }
]
 */
/**
 * @apiDefine removeFriendSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "status": "removed"
}
 */
/**
 * @apiDefine followUserSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "follow": "461d79e1-f4c6-452c-844e-5faac57c30f6",
  "user": {
    "user": "ed3d35af-68c5-43bd-b872-dccc5687bb6a",
    "username": "cliftonc",
    "altid": "1",
    "userdata": {
      "avatar": "test.jpg"
    }
  },
  "user_follower": {
    "user": "39f9f9be-c426-4947-a861-c9942470f4cf",
    "username": "phteven",
    "altid": "2",
    "userdata": {
      "avatar": "test.jpg"
    }
  },
  "isprivate": false,
  "ispersonal": false,
  "since": "2015-06-30T09:19:34.622Z"
}
 */
/**
 * @apiDefine getFollowSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "follow": "461d79e1-f4c6-452c-844e-5faac57c30f6",
  "user": {
    "user": "ed3d35af-68c5-43bd-b872-dccc5687bb6a",
    "username": "cliftonc",
    "altid": "1",
    "userdata": {
      "avatar": "test.jpg"
    }
  },
  "user_follower": {
    "user": "39f9f9be-c426-4947-a861-c9942470f4cf",
    "username": "phteven",
    "altid": "2",
    "userdata": {
      "avatar": "test.jpg"
    }
  },
  "since": "2015-06-30T09:19:34.622Z",
  "isprivate": false,
  "ispersonal": false
}
 */
/**
 * @apiDefine getFollowersSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
[
  {
    "user": "ed3d35af-68c5-43bd-b872-dccc5687bb6a",
    "user_follower": {
      "user": "39f9f9be-c426-4947-a861-c9942470f4cf",
      "username": "phteven",
      "altid": "2",
      "userdata": {
        "avatar": "test.jpg"
      }
    },
    "since": "2015-06-30T09:19:34.622Z",
    "isprivate": false,
    "ispersonal": false
  },
  {
    "user": "ed3d35af-68c5-43bd-b872-dccc5687bb6a",
    "user_follower": {
      "user": "955a6718-e36a-4a2c-9470-517538b48c7f",
      "username": "ted",
      "altid": "3",
      "userdata": {
        "avatar": "test.jpg"
      }
    },
    "since": "2015-06-30T09:19:34.644Z",
    "isprivate": false,
    "ispersonal": false
  }
]
 */
/**
 * @apiDefine unFollowUserSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "status": "removed"
}
 */
/**
 * @apiDefine getPostSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "post": "6466e145-b283-4e87-b643-a5e5594e8bf2",
  "content": "Hello, this is a post",
  "content_type": "text/html",
  "user": {
    "user": "ed3d35af-68c5-43bd-b872-dccc5687bb6a",
    "username": "cliftonc",
    "altid": "1",
    "userdata": {
      "avatar": "test.jpg"
    }
  },
  "posted": "2015-06-30T09:19:34.811Z",
  "isprivate": false,
  "ispersonal": false
}
 */
/**
 * @apiDefine removePostSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "status": "removed"
}
 */
/**
 * @apiDefine addPostSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "post": "af587a17-876d-478c-b858-817d303ba23a",
  "user": {
    "user": "79e96603-6048-42d1-9944-3d720128d3ad",
    "username": "new_name",
    "altid": "new_altid",
    "userdata": {
      "hello": "world"
    }
  },
  "content": {
    "hello": "world"
  },
  "content_type": "application/json",
  "posted": "2015-06-30T09:19:34.993Z",
  "isprivate": false,
  "ispersonal": false
}
 */
/**
 * @apiDefine addLikeSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "like": "5a11327a-dc36-436c-9e82-ff077ccc016a",
  "user": {
    "user": "ed3d35af-68c5-43bd-b872-dccc5687bb6a",
    "username": "cliftonc",
    "altid": "1",
    "userdata": {
      "avatar": "test.jpg"
    }
  },
  "item": "http%3A%2F%2Fgithub.com",
  "since": "2015-06-30T09:19:35.062Z"
}
 */
/**
 * @apiDefine getLikeSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "like": "5a11327a-dc36-436c-9e82-ff077ccc016a",
  "item": "http%3A%2F%2Fgithub.com",
  "user": {
    "user": "ed3d35af-68c5-43bd-b872-dccc5687bb6a",
    "username": "cliftonc",
    "altid": "1",
    "userdata": {
      "avatar": "test.jpg"
    }
  },
  "since": "2015-06-30T09:19:35.062Z"
}
 */
/**
 * @apiDefine checkLikeSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "like": "5a11327a-dc36-436c-9e82-ff077ccc016a",
  "user": {
    "user": "ed3d35af-68c5-43bd-b872-dccc5687bb6a",
    "username": "cliftonc",
    "altid": "1",
    "userdata": {
      "avatar": "test.jpg"
    }
  },
  "since": "2015-06-30T09:19:35.062Z",
  "userLikes": true,
  "count": 1
}
 */
/**
 * @apiDefine removeLikeSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "status": "removed"
}
 */
/**
 * @apiDefine getFeedSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "feed": [
    {
      "like": "5a11327a-dc36-436c-9e82-ff077ccc016a",
      "item": "http%3A%2F%2Fgithub.com",
      "user": {
        "user": "ed3d35af-68c5-43bd-b872-dccc5687bb6a",
        "username": "cliftonc",
        "altid": "1",
        "userdata": {
          "avatar": "test.jpg"
        }
      },
      "since": "2015-06-30T09:19:35.062Z",
      "_item": "5a11327a-dc36-436c-9e82-ff077ccc016a",
      "type": "like",
      "timeuuid": "1fa3236e-1f09-11e5-8b5d-4fd80e94afb8",
      "date": "2015-06-30T09:19:35.062Z",
      "fromNow": "a few seconds ago",
      "isprivate": false,
      "ispersonal": false,
      "fromFollower": true,
      "isLike": true,
      "isPost": false,
      "isFollow": false,
      "isFriend": false,
      "isUsersItem": true
    },
    {
      "post": "6466e145-b283-4e87-b643-a5e5594e8bf2",
      "content": "Hello, this is a post",
      "content_type": "text/html",
      "user": {
        "user": "ed3d35af-68c5-43bd-b872-dccc5687bb6a",
        "username": "cliftonc",
        "altid": "1",
        "userdata": {
          "avatar": "test.jpg"
        }
      },
      "posted": "2015-06-30T09:19:34.811Z",
      "isprivate": false,
      "ispersonal": false,
      "_item": "6466e145-b283-4e87-b643-a5e5594e8bf2",
      "type": "post",
      "timeuuid": "1f7cd6b9-1f09-11e5-8390-ddc52b0dd553",
      "date": "2015-06-30T09:19:34.811Z",
      "fromNow": "a few seconds ago",
      "fromFollower": true,
      "isLike": false,
      "isPost": true,
      "isFollow": false,
      "isFriend": false,
      "isUsersItem": true
    },
    {
      "follow": "41273303-9fbc-481b-b416-8e4d5f00aa21",
      "user": {
        "user": "ed3d35af-68c5-43bd-b872-dccc5687bb6a",
        "username": "cliftonc",
        "altid": "1",
        "userdata": {
          "avatar": "test.jpg"
        }
      },
      "user_follower": {
        "user": "955a6718-e36a-4a2c-9470-517538b48c7f",
        "username": "ted",
        "altid": "3",
        "userdata": {
          "avatar": "test.jpg"
        }
      },
      "since": "2015-06-30T09:19:34.644Z",
      "isprivate": false,
      "ispersonal": false,
      "_item": "41273303-9fbc-481b-b416-8e4d5f00aa21",
      "type": "follow",
      "timeuuid": "1f635b46-1f09-11e5-b6cb-8528a7505d8b",
      "date": "2015-06-30T09:19:34.644Z",
      "fromNow": "a few seconds ago",
      "fromFollower": true,
      "isLike": false,
      "isPost": false,
      "isFollow": true,
      "isFriend": false,
      "isUsersItem": true
    },
    {
      "follow": "461d79e1-f4c6-452c-844e-5faac57c30f6",
      "user": {
        "user": "ed3d35af-68c5-43bd-b872-dccc5687bb6a",
        "username": "cliftonc",
        "altid": "1",
        "userdata": {
          "avatar": "test.jpg"
        }
      },
      "user_follower": {
        "user": "39f9f9be-c426-4947-a861-c9942470f4cf",
        "username": "phteven",
        "altid": "2",
        "userdata": {
          "avatar": "test.jpg"
        }
      },
      "since": "2015-06-30T09:19:34.622Z",
      "isprivate": false,
      "ispersonal": false,
      "_item": "461d79e1-f4c6-452c-844e-5faac57c30f6",
      "type": "follow",
      "timeuuid": "1f5fffe5-1f09-11e5-8560-295181d21efd",
      "date": "2015-06-30T09:19:34.622Z",
      "fromNow": "a few seconds ago",
      "fromFollower": true,
      "isLike": false,
      "isPost": false,
      "isFollow": true,
      "isFriend": false,
      "isUsersItem": true
    },
    {
      "friend": "44d2f4e5-be2a-49e4-8e3e-7bece78d1276",
      "user": {
        "user": "ed3d35af-68c5-43bd-b872-dccc5687bb6a",
        "username": "cliftonc",
        "altid": "1",
        "userdata": {
          "avatar": "test.jpg"
        }
      },
      "user_friend": {
        "user": "39f9f9be-c426-4947-a861-c9942470f4cf",
        "username": "phteven",
        "altid": "2",
        "userdata": {
          "avatar": "test.jpg"
        }
      },
      "since": "2015-06-30T09:19:34.374Z",
      "_item": "44d2f4e5-be2a-49e4-8e3e-7bece78d1276",
      "type": "friend",
      "timeuuid": "1f3a2861-1f09-11e5-9717-1de78416461c",
      "date": "2015-06-30T09:19:34.374Z",
      "fromNow": "a few seconds ago",
      "isprivate": true,
      "ispersonal": false,
      "fromFollower": true,
      "isLike": false,
      "isPost": false,
      "isFollow": false,
      "isFriend": true,
      "isUsersItem": true
    },
    {
      "post": "c2b200fc-dedb-40fe-87d0-c4b9d5feed28",
      "content": "Hello, this is a private post",
      "content_type": "text/html",
      "user": {
        "user": "ed3d35af-68c5-43bd-b872-dccc5687bb6a",
        "username": "cliftonc",
        "altid": "1",
        "userdata": {
          "avatar": "test.jpg"
        }
      },
      "posted": "2010-07-28T06:01:00.145Z",
      "isprivate": true,
      "ispersonal": false,
      "_item": "c2b200fc-dedb-40fe-87d0-c4b9d5feed28",
      "type": "post",
      "timeuuid": "7f10961a-9a0d-11df-8ebf-4c22bb5f5a8e",
      "date": "2010-07-28T06:01:00.145Z",
      "fromNow": "5 years ago",
      "fromFollower": true,
      "isLike": false,
      "isPost": true,
      "isFollow": false,
      "isFriend": false,
      "isUsersItem": true
    }
  ],
  "more": null
}
 */
/**
 * @apiDefine getUserFeedSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
[
  {
    "friend": "fa0da3ab-080f-443f-a2c3-c48e95dc3bad",
    "user": {
      "user": "39f9f9be-c426-4947-a861-c9942470f4cf",
      "username": "phteven",
      "altid": "2",
      "userdata": {
        "avatar": "test.jpg"
      }
    },
    "user_friend": {
      "user": "ed3d35af-68c5-43bd-b872-dccc5687bb6a",
      "username": "cliftonc",
      "altid": "1",
      "userdata": {
        "avatar": "test.jpg"
      }
    },
    "since": "2015-06-30T09:19:34.374Z",
    "_item": "fa0da3ab-080f-443f-a2c3-c48e95dc3bad",
    "type": "friend",
    "timeuuid": "1f3a2862-1f09-11e5-8003-deab09bc31c2",
    "date": "2015-06-30T09:19:34.374Z",
    "fromNow": "a few seconds ago",
    "isprivate": true,
    "ispersonal": false,
    "fromFollower": true,
    "isLike": false,
    "isPost": false,
    "isFollow": false,
    "isFriend": true,
    "isUsersItem": false
  }
]
 */
/**
 * @apiDefine getUserRelationshipSuccessExample
 * @apiSuccessExample
HTTP1.1 200 Success
{
  "isFriend": true,
  "isFriendSince": "2015-06-30T09:19:34.374Z",
  "isFriendRequestPending": false,
  "isFriendRequestSince": null,
  "youFollow": false,
  "youFollowSince": null,
  "youFollowPrivate": false,
  "youFollowPersonal": false,
  "theyFollow": true,
  "theyFollowSince": "2015-06-30T09:19:34.622Z",
  "theyFollowPrivate": false,
  "theyFollowPersonal": false,
  "inCommon": [],
  "followerCount": 0
}
 */
