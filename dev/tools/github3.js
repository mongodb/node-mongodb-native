
/*!
 * NodeJS GitHub API (v3) Wrapper
 * @author Edward Hotchkiss
 * @contributir Matias Woloski (@woloski)
 * @class Github3
 */

var request = require('request');
var noOp = function(){};

/*!
 * Sets credentials for GitHub access.
 * @class Github3
 * @constructor
 * @param {Object} opts
 *        {String} .username GitHub username
 *        {String} .password GitHub password
 *        {Token } .accessToken GitHub oAuth Token
 */

var Github3 = function(opts){
  //defaults
  opts = opts || {};
  this.username           = opts.username    || '';
  this.password           = opts.password    || '';
  // oAuth Token
  this.accessToken        = opts.accessToken || '';
  // API Rate Limit Details
  this.rateLimit          = 5000;
  this.rateLimitRemaining = this.rateLimit;  //rateLimitRemaining starts as rateLimit
};

/*!
 * This method creates and returns and instance of Github3
 * @param {Object} opts Options passed along to the Github3 constructor.
 */
var createInstance = function(opts){
  return new Github3(opts);
};

/*!
 * For the sake of backwards compatibility I've made this method return an instance.
 * This particular instance has a createInstance factory method that can create other instances of the Github3 class.
 * In a future version this should be updated to:
 * module.exports = createInstance; //set module.exports to the createInstance function
 */

module.exports = (function(){
  var github3 = createInstance();
  github3.createInstance = createInstance;
  return github3;
})();

/*!
 * Sets credentials for GitHub access.
 * @class Github3
 * @method setCredentials
 * @param {String} username GitHub username
 * @param {String} password GitHub password
 */

Github3.prototype.setCredentials = function(username, password) {
  this.username = username;
  this.password = password;
};

/*!
 * Sets oAuth Access Token for GitHub access.
 * @class Github3
 * @method setAccessToken
 * @param {Token}
*/

Github3.prototype.setAccessToken = function(token) {
  this.accessToken = token;
};

/*!
 * Builds and executes a github api call
 * @class Github3
 * @private _request
 * @param {Object} options or just API URI Path for GET requests
 * @param {Function} callback Function to call upon error or success
 * @returns {Object} error, {Object} data
*/

Github3.prototype._request = function (options, callback) {
  var base;
  callback = callback || noOp; //makes callback not required.
  if (this.username && this.password) {
    // if we have credentials, use them in request
    base = 'https://'+this.username+':'+this.password+'@api.github.com';
  } else {
    base = 'https://api.github.com';
  }

  if (typeof(options) != "string") {
    options.uri = base + options.uri;
  }

  options.headers['User-Agent'] = 'node.js';

  if (this.accessToken) {
    options.headers.Authorization = 'token ' + this.accessToken;
  }

  return request(options, function(error, response, body) {
    if (error) {
      callback(error, null);
    } else {
      switch(response.statusCode) {
        case 404:
          callback(new Error('Path not found'), null);
          break;
        // TODO: handle 4XX errors
        case 422:
          callback(new Error(response.body.message), null);
          break;
        default:
          try {
            // Grab the Rate Limit details and make them available
            this.rateLimit = response.headers['x-ratelimit-limit'];
            this.rateLimitRemaining = response.headers['x-ratelimit-remaining'];
            if (body) {
              var data = JSON.parse(body);
              return callback(null, data);
            }
            // Some API do not have body content
            callback(null, response.headers.status);
          } catch (error2) {
            callback(error2, null);
          }
      }
    }
  });
};

/*!
 * Performs a GET
 * @class Github3
 * @private _get
 * @param {String} path API endpoint
 * @param {Functon} callback Method to execute on completion
 */

Github3.prototype._get = function(path, callback) {
  return this._request({
    uri: path,
    headers: {}
  }, callback);
};

/*!
 * Performs a PUT
 * @class Github3
 * @private _put
 * @param {String} path API endpoint
 * @param {Object} body Data
 * @param {Functon} callback Method to execute on completion
 */

Github3.prototype._put = function(path, body, callback) {
  body = body || '{}';
  return this._request({
    uri:path,
    method:"PUT",
    headers: {
      "Content-Length":body.length
    },
    body:body
  },
  callback);
};

/*!
 * Performs a PATCH
 * @class Github3
 * @private _patch
 * @param {String} path API endpoint
 * @param {Object} body Data
 * @param {Functon} callback Method to execute on completion
 */

Github3.prototype._patch = function(path, body, callback) {
  body = body || '{}';
  return this._request({
    uri:path,
    method:'PATCH',
    headers:{
      'Content-Length':body.length
    },
    body:body
  },
  callback);
};

Github3.prototype._post = function(path, body, callback) {
  body = body || '{}';
  return this._request({
    uri:path,
    method:"POST",
    headers: {
      "Content-Length":body.length
    },
    body:body
  },
  callback);
};

/*!
 * Performs a DELETE
 * @class Github3
 * @private _delete
 * @param {String} path API endpoint
 * @param {Object} body Data
 * @param {Functon} callback Method to execute on completion
 */

Github3.prototype._delete = function(path, body, callback) {
  body = body || '{}';
  return this._request({
    uri:path,
    method:"DELETE",
    headers: {
      "Content-Length":body.length
    },
    body:body
  },
  callback);
}


/*!
 * Retreives a Users Information
 * @class Github3
 * @method getUser
 * @param {Functon} callback Method to execute on completion
 */

Github3.prototype.getUser = function(user, callback){
  return this._get('/users/' + user, callback);
};

/*!
 * Retrieves a Users Repos
 * @class Github3
 * @method getUserRepos
 * @param {Functon} callback Method to execute on completion
 */

Github3.prototype.getUserRepos = function(user, callback){
  return this._get('/users/' + user + '/repos', callback);
};

/*!
 * Repos a user is watching
 * @class Github3
 * @method getUserRepos
 * @param {Functon} callback Method to execute on completion
 */

Github3.prototype.getUsersWatched = function(user, callback){
  return this._get('/users/' + user + '/watched', callback);
};

/*!
 * Retrieve Organization Members
 * @class Github3
 * @method getOrgMembers
 * @param {Functon} callback Method to execute on completion
 */

Github3.prototype.getOrgMembers = function(org, callback){
  return this._get('/orgs/'+ org + '/public_members', callback);
};

/*!
 * Followers
 * @class Github3
 * @method getFollowers
 * @param {Functon} callback Method to execute on completion
 */

Github3.prototype.getFollowers = function(user, callback){
  return this._get('/users/'+ user + '/followers', callback);
};

/*!
 * Retrieve users following `user`
 * @class Github3
 * @method getFollowers
 * @param {Functon} callback Method to execute on completion
 */

Github3.prototype.getFollowing = function(user, callback){
  return this._get('/users/'+ user + '/following', callback);
};

/*!
 * Retrieve pull requests (open/closed) on a repository
 * @class Github3
 * @method getPullRequests
 * @param {String} repo Repository
 * @param {String} state Pull Request Status -- open or closed
 * @param {Functon} callback Method to execute on completion
 */

Github3.prototype.getPullRequests = function (repo, name, state, callback){
  state = state || 'open';
  return this._get('/repos/'+name+'/'+repo+'/pulls?state='+state, callback);
};

/*!
 * Retrieve an issues comments
 * @class Github3
 * @method getPullRequests
 * @param {String} repo Repository
 * @param {String} name repo owner name
 * @param {Number} issueId ID # of issue
 * @param {Functon} callback Method to execute on completion
 */

Github3.prototype.getIssueComments = function (repo, name, issueId, callback) {
  return this._get('/repos/'+name+'/'+repo+'/issues/'+issueId+'/comments', callback);
};

/*!
 * Merges a pull request
 * @class Github3
 * @method mergePullRequest
 * @param {String} repo Repository
 * @param {String} name repo owner name
 * @param {Number} issueId ID # of issue
 * @param {Functon} callback Method to execute on completion
 */

Github3.prototype.mergePullRequest = function (repo, name, pullRequestId, callback) {
  return this._put('/repos/'+name+'/'+repo+'/pulls/'+pullRequestId+'/merge','', callback);
};

/*!
 * Closes a pull request
 * @class Github3
 * @method closePullRequest
 * @param {String} repo Repository
 * @param {String} name repo owner name
 * @param {Number} pullRequestId ID # of pull request
 * @param {Functon} callback Method to execute on completion
 */

Github3.prototype.closePullRequest = function (repo, name, pullRequestId, callback) {
  return this._patch('/repos/'+name+'/'+repo+'/pulls/'+pullRequestId+'','{ "state":"closed" }', callback);
};

/*!
 * Repository Contributors
 * @class Github3
 * @method getContributors
 * @param {Functon} callback Method to execute on completion
 */

Github3.prototype.getContributors = function(repo, name, callback) {
  return this._get('/repos/'+name+'/'+repo+'/contributors',callback);
};

/*!
 * Repository Languages
 * @class Github3
 * @method getLanguages
 */

Github3.prototype.getLanguages = function(repo, name, callback) {
  return this._get('/repos/'+name+'/'+repo+'/languages',callback);
};

/*!
 * Retrieve repository branches
 * @class Github3
 * @method getBranches
 * @param {Functon} callback Method to execute on completion
 */

Github3.prototype.getBranches = function (repo, name, callback) {
  return this._get('/repos/'+name+'/'+repo+'/branches',callback);
};

/*!
 * Retrieve repository collaborators
 * @class Github3
 * @method getCollaborators
 * @param {Functon} callback Method to execute on completion
 */

Github3.prototype.getCollaborators = function (repo, name, callback) {
  return this._get('/repos/'+name+'/'+repo+'/collaborators',callback);
};

/*!
 * Retrieve Repository Commits
 * @class Github3
 * @method getCommits
 * @param {Functon} callback Method to execute on completion
 */

Github3.prototype.getCommits = function (repo, name, callback) {
  return this._get('/repos/'+name+'/'+repo+'/commits',callback);
};

/*!
 * Repository last commit ref
 * @class Github3
 * @method getLastCommitRef
*/

Github3.prototype.getLastCommitRef = function (repo,name,branch,callback) {
  // /repos/#{@repo}/git/refs/heads/#{@branch}"
  return this._get('/repos/'+name+'/'+repo+'/git/refs/heads/'+branch, callback);
};

/*!
 * Repository commit
 * @class Github3
 * @method getCommit
 */

Github3.prototype.getCommit = function (repo,name,sha,callback) {
  // /repos/{name}/{repo}/git/commits/{sha}
  return this._get('/repos/'+name+'/'+repo+'/git/commits/'+sha, callback);
};

/*!
 * Repository tree
 * @class Github3
 * @method getTree
 */

Github3.prototype.getTree = function (repo,name,sha,callback) {
  // /repos/{name}/{repo}/git/trees/{sha}
  return this._get('/repos/'+name+'/'+repo+'/git/trees/'+sha, callback);
};

/*!
 * Repository blob
 * @class Github3
 * @method getBlobText
 */

Github3.prototype.getBlobText = function (repo,name,sha,callback) {
  // /repos/{name}/{repo}/git/blobs/{sha}
  callback = callback || noOp;
  return this._get('/repos/'+name+'/'+repo+'/git/blobs/'+sha, function(error, data) {
    if (data.content !== null && data.encoding === 'base64') {
      data.content = new Buffer(data.content.replace('\n', ''), 'base64').toString('utf8');
    }
    callback(error, data);
  });
};

/*!
 * Repository blob
 * @class Github3
 * @method getBlobTextByName
 */

Github3.prototype.getBlobTextByFilePath = function (repo,name, path, callback) {
  var self = this;
  callback = callback || noOp; //makes callback not required.
  return this.getLastCommitRef(repo, name, 'master', function(error, data) {
    if (error !== null)
        callback(error, null);

    self.getCommit(repo, name, data.object.sha, function(error, data) {
        if (error !== null)
            callback(error, null);

        self.getTree(repo, name, data.tree.sha, function(error, data) {
            if (error !== null)
                callback(error, null);

            data.tree.forEach(function (item) {
                if (item.path === path) {
                    self.getBlobText(repo, name, item.sha, callback);
                }
            });
        });
    });
  });
};

/*!
 * Repository Forks
 * @class Github3
 * @method getForks
 * @param {Functon} callback Method to execute on completion
 */

Github3.prototype.getForks = function (repo, name, callback) {
  return this._get('/repos/'+name+'/'+repo+'/forks',callback);
};

/*!
 * Repository Watchers
 * @class Github3
 * @method getWatchers
 * @param {Functon} callback Method to execute on completion
 */

Github3.prototype.getWatchers = function (repo,name,callback) {
  return this._get('/repos/'+name+'/'+repo+'/watchers',callback);
};

/*!
 * Repository
 * @class Github3
 * @method getRepository
 * @param {Functon} callback Method to execute on completion
 */

Github3.prototype.getRepository = function (repo, name ,callback) {
  return this._get('/repos/'+name+'/'+repo,callback);
};

/*!
 * Retrieve repository labels
 * @class Github3
 * @method getLabels
 * @param {String} repo Repository Name
 * @param {String} repository owner name
 * @param {Functon} callback Method to execute on completion
 */

Github3.prototype.getLabels = function(repo, name, callback) {
  return this._get('/repos/'+name+'/'+repo+'/labels', callback);
};

/*!
 * Retrieve labels on a repository issue by ID #
 * @class Github3
 * @method getIssueLabels
 * @param {String} repo Repository Name
 * @param {String} repository owner name
 * @param {Functon} callback Method to execute on completion
 */

Github3.prototype.getIssueLabels = function(repo, name, issueId, callback) {
  return this._get('/repos/'+name+'/'+repo+'/issues/'+issueId+'/labels', callback);
};

/*!
 * Repository tree
 * @class Github3
 * @method createTreeAndAddFile
 */

Github3.prototype.createTreeAndAddFile = function (repo, name, path, content, last_tree_sha, callback) {
  var new_tree = {
    "base_tree" : last_tree_sha,
    "tree" : [{"path" : path, "mode" : "100644", "type" : "blob", "content": content}]
  };
  return this._post('/repos/'+name+'/'+repo+'/git/trees', JSON.stringify(new_tree), callback);
};

Github3.prototype.createCommit = function (repo, name, message, tree_sha, parent_commit_sha, author, callback) {
  var commit = { 'message' : message, 'parents' : [parent_commit_sha], 'tree' : tree_sha, 'author' : author };
  return this._post('/repos/'+name+'/'+repo+'/git/commits', JSON.stringify(commit), callback);
};

Github3.prototype.updateRefHead = function (repo, name, branch, commit_sha, force, callback) {
  var ref = {'sha' : commit_sha, 'force' : force};
  return this._post('/repos/'+name+'/'+repo+'/git/refs/heads/'+ branch, JSON.stringify(ref), callback);
};

/*!
 * Stars a repository
 * @class Github3
 * @method starRepository
 * @param {String} repo Repository
 * @param {String} name repo owner name
 * @param {Functon} callback Method to execute on completion
 */
 
Github3.prototype.starRepository = function (repo, name, callback) {
  return this._put('/user/starred/'+name+'/'+repo,'', callback);
}

/*!
 * Unstars a repository
 * @class Github3
 * @method unstarRepository
 * @param {String} repo Repository
 * @param {String} name repo owner name
 * @param {Functon} callback Method to execute on completion
 */
 
Github3.prototype.unstarRepository = function (repo, name, callback) {
  return this._delete('/user/starred/'+name+'/'+repo,'', callback);
}

/* EOF */