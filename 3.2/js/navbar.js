$(function() {
    var docsExcludedNav = window.docsExcludedNav;

    /* Checks a whitelist for non-leaf nodes that should trigger a full page reload */
    function requiresPageload($node) {
        if (!docsExcludedNav || !docsExcludedNav.length) {
            return false;
        }

        for (var i = 0; i < docsExcludedNav.length; i++) {
            if ($node[0].href.indexOf(docsExcludedNav[i]) !== -1) {
                return true;
            }
        }
        return false;
    }

    /* currently open page */
    function isCurrentNode($node) {
        return $node.hasClass('current');
    }

    function isLeafNode($node) {
        return !$node.siblings('ul:not(.simple)').length;
    }

    var $current = $('.sidebar a.current');
    if (isLeafNode($current) || requiresPageload($current) || isCurrentNode($current)) {
        $current.parent('li').addClass('selected-item');
    }
    $current.parents('ul').each(function(index, el) {
        $(el).css('display', 'block');
    });

    $('.sphinxsidebarwrapper > ul li:not(.current) > ul:not(.current)').hide();
    $('.sphinxsidebarwrapper').show();

    /*
     * This event handler defines the left-column navigation's behavior
     * The logic conforms to how sphinx generates the markup
     * The rules are:
     *  $('a.current') is the title of the content that is currently rendered (this should never be changed client-side)
     *  $('ul.current, li.current') are the set of lists that are currently expanded
     *  $('li.selected-item') is the currently highlighted item
     */
    $('.sphinxsidebarwrapper .toctree-l1').on('click', 'a', function(e) {
        var $target = $(e.currentTarget);
        if (isLeafNode($target)) {
            return; // Do a full page reload on leaf nodes
        }

        // Release notes has special behavior to click through
        if (!$target.parent().hasClass('selected-item') && requiresPageload($target)) {
            return;
        }

        e.preventDefault();

        if ($target.parent().hasClass('current')) {
            // collapse target node
            $target.parent().removeClass('current selected-item');
            $target.siblings('ul').slideUp();
        } else {

            $current.parent().removeClass('selected-item');
            // roll up all navigation up to the common ancestor
            $current.parents().add($current.siblings('ul')).each(function(index, el) {
                var $el = $(el);
                if ($el.has(e.currentTarget).length) {
                    return;
                }

                if ($el.is('ul')) {
                    $el.removeClass('current').slideUp();
                } else {
                    $el.removeClass('current');
                }
            });
            // add css classes for the new 'current' nav item
            $target.parent().addClass('current');
            $target.siblings('ul').slideDown(function() {
                if (isLeafNode($target) || requiresPageload($target) || isCurrentNode($current)) {
                    $target.parent('li').addClass('selected-item');
                }
            });
            // set new $current
            $current = $target;
        }
    });

    /* Options panel */
    $('.option-header').on('click', function(e) {
        var $target = $(e.currentTarget);

        $target.parent().toggleClass('closed');
        $target.find('.fa-angle-down, .fa-angle-up').toggleClass('fa-angle-down fa-angle-up');
    });

    /* Open options panel when clicking the version */
    $('.sphinxsidebarwrapper h3 a.version').on('click', function(e) {
        e.preventDefault();
        $('.option-popup').removeClass('closed');
    });

    /* Hide toc if there aren't any items */
    if (($('.toc ul  li  ul  li ').length > 1)) {
        $('.right-column .toc').show();
    }

    /* Collapse/expand sections */
    $('.section > h2, .section > h3, .section > h4').on('click', function(e) {
        // ignore links inside headers
        if ($(e.target).is('a')) {
            return;
        }
        var $currentTarget = $(e.currentTarget);
        if (!$currentTarget.hasClass('collapsed')) {
            $currentTarget.nextAll().slideUp();
        } else {
            $currentTarget.nextAll().slideDown();
        }
        $currentTarget.toggleClass('collapsed');
    });

    /* Expand/collapse navbar on narrower viewports */
    $('.expand-toc-icon').on('click', function(e) {
        e.preventDefault();
        $('.sidebar').toggleClass('reveal');
    });

    /* Reset the sidebar when the viewport is wider than tablet size */
    var $window = $(window),
        $sidebar = $('.sidebar'),
        isTabletWidth = $window.width() <= 1093;
    $window.resize(function(e) {
        if (isTabletWidth && $window.width() > 1093) {
            isTabletWidth = false;
            $sidebar.removeClass('reveal');
        } else if (!isTabletWidth && $window.width() <= 1093) {
            isTabletWidth = true;
        }
    });

    /* Adjust the scroll location to account for our fixed header */
    function offsetHashLink() {
        if (location.hash && document.getElementById(location.hash.substr(1))) {
            $(window).scrollTop(window.scrollY - 75);
        }
    }
    window.addEventListener("hashchange", offsetHashLink);
    if (location.hash) {
        window.setTimeout(offsetHashLink, 10);
    }
    $('.content').on('click', 'a', function(e) {
        // Fixes corner case where the user clicks the same hash link twice
        if ($(e.currentTarget).attr('href') === location.hash) {
            window.setTimeout(offsetHashLink, 10);
        }
    });

});
