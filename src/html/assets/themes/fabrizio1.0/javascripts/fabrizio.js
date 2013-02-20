(function($) {

  function Fabrizio() {
    var crumb, log, markup, profiles, pushstate, tags, pathname, util;

    crumb = (function() {
      var value = null;
      return {
        get: function() {
          return value;
        },
        set: function(crumb) {
          value = crumb;
        }
      };
    })(); // crumb
    markup = {
      message: function(message) { // messageMarkup
        var cls = '';
        if(arguments.length > 1) {
          if(arguments[1] == 'error')
            cls = 'error';
          else if(arguments[1] == 'confirm')
            cls = 'success';
        }
        return '<div class="alert-message block-message '+cls+'"><a class="modal-close-click close" href="#">x</a>' + message + '</div>'
      },
      modal: function(header, body, footer) { // modalMarkup
        return '<div class="modal-header">' +
               '  <a href="#" class="close" data-dismiss="modal">&times;</a>' +
               '  <h3>'+header+'</h3>' +
               '</div>' +
               '<div class="modal-body">' +
               '  <p>'+body+'</p>' +
               '</div>' +
               (footer ? '<div class="modal-footer">' + footer + '</div>' : '');
      }
    }; // markup
    profiles = {
      owner: {},
      viewer: {},
      load: function() {
        // TODO cache this somehow
        $.get('/user/profile.json', {includeViewer: '1'}, function(response) {
          if(response.code !== 200)
            return;

          var result = response.result, id = result.id, owner = result, viewer = result.viewer || null;
          if(owner.viewer !== undefined)
            delete owner.viewer;
          TBX.callbacks.profilesSuccess(owner, viewer, profiles);
        }, 'json');
      }
    }; // profiles
    util = (function() {
      return {
        getDeviceWidth: function() {
          return $(window).width();
        },
        fetchAndCache: function(src) {
          $('<img />').attr('src', src).appendTo('body').css('display', 'none').on('load', function(ev) { $(ev.target).remove(); });
        },
        load: function(context) {
          var async = typeof(arguments[1]) === 'undefined' ? true : arguments[1];
          // we define initData at runtime to avoid having to make an HTTP call on load
          // all subsequent calls run through the http API
          if(typeof(context.initData) === "undefined") {
            if(context.end || context.running)
              return;

            context.running = true;

            if(context.page === null) {
              var qsMatch = loc.href.match('page=([0-9]+)');
              if(qsMatch !== null) {
                context.page = qsMatch[1];
              } else {
                var uriMatch = loc.pathname.match(/\/page-([0-9]+)/);
                if(uriMatch !== null) {
                  context.page = uriMatch[1];
                }
              }

              if(context.page === null)
                context.page = 1;
            }

            var api = context.pageLocation.pathname+'.json';
                params = {}, qs = context.pageLocation.search.replace('?', '');
            
            if(qs.length > 0) {
              var qsKeyValueStrings = qs.split('&'), qsKeyAndValue;
              for(i in qsKeyValueStrings) {
                if(qsKeyValueStrings.hasOwnProperty(i)) {
                  qsKeyAndValue = qsKeyValueStrings[i].split('=');
                  if(qsKeyAndValue.length === 2) {
                    params[qsKeyAndValue[0]] = qsKeyAndValue[1];
                  }
                }
              }
            }

            params.returnSizes = '960x180,870x870,180x180xCR';
            params.page = context.page;
            // for mobile devices limit the number pages before a full page refresh. See #778
            if(context.pageCount > context.maxMobilePageCount && util.getDeviceWidth() < 900) {
              location.href = context.pageLocation.pathname + '?' + decodeURIComponent($.param(params));
            } else {
              $.ajax({
                async: async,
                dataType: 'json',
                url: api,
                data: params,
                success: context.loadCb
              });
            }
          } else {
            delete context.initData;
            context.page = 1;
            var response = {code:200, result:initData};
            context.loadCb(response);
          }
        },
        scrollCb: function(context) {
          // don't autoload if the width is narrow
          //  crude way to check if we're on a mobile device
          //  See #778
          if(util.getDeviceWidth() < 900)
            return;

          if($(window).scrollTop() > $(document).height() - $(window).height() - 200){
            context.load();
          }
        },
      };
    })(); // util

    this.crumb = function() { return crumb.get(); };
    this.init = {
      load: function(_crumb) {
        // http://stackoverflow.com/a/6974186
        // http://stackoverflow.com/questions/6421769/popstate-on-pages-load-in-chrome/10651028#10651028
        var popped = ('state' in window.history && window.history.state !== null);

        crumb.set(_crumb);
        OP.Tag.init();
        OP.Album.init();
        pathname = location.pathname;

        /* jm History.Adapter.bind(window,'statechange',function(){
          var State = History.getState(),
              initialPop = !popped && location.href == initialURL;
          popped = true;
          if(initialPop)
            return;

          pushstate.render(State.data);
        });*/

        // TODO cache in local storage

        profiles.load();
        
        /**
         * Initialize tags typeahead in the header
         */
        new op.data.view.TagSearch({el: $('.trovebox-banner input[type=search]')});
        
        // init tooltips

        if(location.pathname === '/')
          TBX.init.pages.front.init();
        else if(location.pathname.search(/^\/albums(.*)\/list/) === 0)
          TBX.init.pages.albums.init();
        else if(location.pathname === '/manage/photos')
          TBX.init.pages.manage.photos();
        else if(location.pathname.search(/^\/photos(.*)\/list/) === 0)
          TBX.init.pages.photos.init();
        else if(location.pathname.search(/^\/p\/[a-z0-9]+/) === 0 || location.pathname.search(/^\/photo\/[a-z0-9]+\/?(.*)\/view/) === 0)
          TBX.init.pages.photo.init();
        else if(location.pathname === '/photos/upload')
          TBX.init.pages.upload();
      },
      attachEvents: function() {
        OP.Util.on('preload:photos', TBX.handlers.custom.preloadPhotos);
      },
      pages: {
        albums: {
          initData: typeof(initData) === "undefined" ? undefined : initData,
          filterOpts: typeof(filterOpts) === "undefined" ? undefined : filterOpts,
          batchModel: new op.data.model.Batch(),
          page: null,
          pageCount: 0,
          pageLocation: {
            pathname: window.location.pathname,
            search: window.location.search
          },
          maxMobilePageCount: 5,
          end: false,
          running: false,
          addAlbums: function(albums) {
            var album, model, view, $el;
            for(i in albums) {
              if(albums.hasOwnProperty(i)) {
                $el = $('<li class="album" />').appendTo($('ul.albums'))
                album = albums[i];
                op.data.store.Albums.add( album );
                model = op.data.store.Albums.get(album.id);
                view = new op.data.view.AlbumCover({model: model, el: $el});
                view.render();
              }
            }
          },
          init: function() {
            var _pages = TBX.init.pages, _this = _pages.albums, batchModel = _pages.albums.batchModel, $batchEl = $('.batch-meta');
            (new op.data.view.BatchIndicator({model:batchModel, el: $batchEl})).render();
            $(window).scroll(function() { util.scrollCb(_this); });
            _this.load();
          },
          load: function() {
            var _this = TBX.init.pages.albums; loc = location;
            util.load(_this);
          },
          loadCb: function(response) {
            var items = response.result, _this = TBX.init.pages.albums;
            for(i in items) {
              if(items.hasOwnProperty(i))
                op.data.store.Albums.add( items[i] );
            }
            if(items.length > 0) {
              _this.addAlbums(items);
              _this.page++;
              _this.pageCount++;
              _this.running = false;
            }
          }
        },
        front: {
          init: function() {}
        },
        photo: {
          initData: typeof(initData) === "undefined" ? undefined : initData,
          filterOpts: typeof(filterOpts) === "undefined" ? undefined : filterOpts,
          photo: null,
          el: $('.photo-detail'),
          init: function() {
            var options, _this = TBX.init.pages.photo;
            if(_this.initData === undefined) {
              return;
            }

            options = {
              routes: {
                "p/:id": "photoDetail" 
              },
              render: _this.render
            };
            op.data.store.Router = new op.data.route.Routes(options);
            // Start Backbone history a necessary step for bookmarkable URL's
            Backbone.history.start({pushState: true, silent: true});

            _this.photo = initData;
            delete _this.photo.actions;
            _this.render(_this.photo);
            delete _this.initData;
          },
          load: function(id) {
            // TODO don't hard code the returnSizes
            var _this = TBX.init.pages.photo, endpoint, apiParams = {nextprevious:'1', returnSizes:'90x90xCR,870x550'};
            
            if(_this.filterOpts === undefined || _this.filterOpts === null)
              endpoint = '/photo/'+id+'/view.json';
            else
              endpoint = '/photo/'+id+'/'+filterOpts+'/view.json';

            OP.Util.makeRequest(endpoint, apiParams, function(response) {
              _this.render(response.result);
            }, 'json', 'get');
          },
          render: function(photo) {
            var _this = TBX.init.pages.photo, $el = _this.el;
            op.data.store.Photos.add(photo);
            if( !_this.photoDetailView ){
              _this.photoDetailView = (new op.data.view.PhotoDetail({model: op.data.store.Photos.get(photo.id), el: $el})).render();
            }
            else {
              // instead of rerendering, lets just go to the specific photo
              // since it assumes it is already part of the store.
              _this.photoDetailView.go( photo.id );
              // if there is a lightbox view, close it
              //op.Lightbox.getInstance().hide();
            }
          }
        },
        photos: {
          // TODO have a better way of sending data into the JS framework. See #780
          initData: typeof(initData) === "undefined" ? undefined : initData,
          filterOpts: typeof(filterOpts) === "undefined" ? undefined : filterOpts,
          batchModel: new op.data.model.Batch({count: OP.Batch.length()}),
          page: null,
          pageCount: 0,
          pageLocation: {
            pathname: window.location.pathname,
            search: window.location.search
          },
          maxMobilePageCount: 5,
          end: false,
          running: false,
          init: function() {
            var options, _pages = TBX.init.pages, _this = _pages.photos, batchModel = _pages.photos.batchModel, $batchEl = $('.batch-meta');
            $(window).scroll(function() { util.scrollCb(_this); });
            _this.load();
            (new op.data.view.BatchIndicator({model:batchModel, el: $batchEl})).render();

            options = {
              routes: {
                "p/:id": "photoModal",
                "photos/:options/list": "photosList",
                "photos/list": "photosList"
              },
            };
            op.data.store.Router = new op.data.route.Routes(options);
            // Start Backbone history a necessary step for bookmarkable URL's
            Backbone.history.start({pushState: true, silent: true});
          },
          load: function() {
            var _this = TBX.init.pages.photos, async = typeof(arguments[0]) === 'undefined' ? true : arguments[0];
            util.load(_this, async);
          },
          loadCb: function(response) {
            var items = response.result, _this = TBX.init.pages.photos, infobar = $('.infobar'),
                minDate = $('.startdate', infobar), maxDate = $('.enddate', infobar),
                minDateVal = parseInt(minDate.attr('data-time')), maxDateVal = parseInt(maxDate.attr('data-time')),
                ui = TBX.ui, i;

            op.data.store.Photos.add( items );
            if(items.length > 0) {
              var thisTaken;
              for(i=0; i<items.length; i++) {
                thisTaken = parseInt(items[i].dateTaken);
                if(thisTaken > maxDateVal) {
                  ui.fadeAndSet(maxDate, phpjs.date('l F jS, Y', thisTaken));
                  maxDate.attr('data-time', thisTaken);
                  maxDateVal = thisTaken;
                } else if(parseInt(items[i].dateTaken) < parseInt(minDate.attr('data-time'))) {
                  ui.fadeAndSet(minDate, phpjs.date('l F jS, Y', thisTaken));
                  minDate.attr('data-time', thisTaken);
                  minDateVal = thisTaken;
                }
              }

              Gallery.showImages($(".photo-grid"), items);
              _this.page++;
              _this.pageCount++;
              _this.running = false;
            } else {
              $('.load-more').hide();
              _this.end = true;
            }
          }
        },
        upload: function() {
          OP.Util.on('upload:complete-success', TBX.callbacks.uploadCompleteSuccess);
          OP.Util.on('upload:complete-failure', TBX.callbacks.uploadCompleteFailure);
          OP.Util.on('upload:uploader-ready', TBX.callbacks.uploaderReady);
          OP.Util.on('submit:photo-upload', TBX.callbacks.upload);
          OP.Util.fire('upload:uploader-ready');
        }
      }
    }; // init
    this.notification = {
      model: new op.data.model.Notification,
      errorIcon: '<i class="icon-warning-sign"></i>',
      successIcon: '<i class="icon-ok"></i>',
      init: function() {
        var $el = $('.notification-meta'), view = new op.data.view.Notification({model: TBX.notification.model, el: $el});
      },
      show: function(message, type, mode) {
        var model = TBX.notification.model;
        if(mode === 'confirm' || typeof mode === 'undefined')
          message = TBX.notification.successIcon + ' ' + message;
        else
          message = TBX.notification.errorIcon + ' ' + message;

        type = type || 'flash';

        model.set('msg', message, {silent:true});
        model.set('mode', mode, {silent:true});
        model.set('type', type, {silent:true});
        model.save();
      },
      display: {
        generic: {
          error: function() {
            TBX.notification.show('Sorry, an unknown error occurred.', 'flash', 'error');
          }
        }
      }
    }; // notification
    this.profiles = {
      getOwner: function() {
        return profiles.owner.id;
      },
      getViewer: function() {
        return profiles.viewer.id;
      }
    }; // profiles
  }

  var _TBX = new Fabrizio;
  TBX.profiles = _TBX.profiles;
  TBX.notification = _TBX.notification;
  TBX.init = _TBX.init;
  TBX.crumb = _TBX.crumb;
})(jQuery);
