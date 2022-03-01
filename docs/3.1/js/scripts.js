function initializeJS() {
    jQuery('.toggle-nav').click(function () {
        var $container = jQuery('#container'),
            $sidebar = jQuery('#sidebar'),
            $ssidebar = jQuery('#sidebar > .ssidebar'),
            $footer = jQuery('#sidebar > .nav-footer'),
            isVisible = $ssidebar.is(":visible") && !$container.hasClass("sidebar-closed-winSize");

        if (isVisible) {
            $container.addClass("sidebar-closed");
            $ssidebar.hide();
            $footer.hide();
            $sidebar.removeClass("reveal");
        } else {
            $container.removeClass("sidebar-closed");
            $container.removeClass("sidebar-closed-winSize");
            $sidebar.addClass("reveal");
            $ssidebar.show();
            $footer.show();
        }
    });

    var resizer = function() {
        var $container = jQuery('#container');
        if (jQuery(window).width() <= 1093) {
            $container.addClass("sidebar-closed-winSize");
        } else {
            $container.removeClass("sidebar-closed-winSize");
        }
    };
    jQuery(window).resize(resizer);
    resizer();
};

jQuery(document).ready(function() {
    initializeJS();
    jQuery('[data-toggle="tooltip"]').tooltip();
    jQuery("body").addClass("jsEnabled");
    hljs.initHighlightingOnLoad();
    var linkRegex = new RegExp('/' + window.location.host + '/');
    jQuery('a').not('[href*="mailto:"]').each(function () {
        if (!linkRegex.test(this.href)) {
            $(this).attr('target', '_blank');
        }
    });
    jQuery('.body table').addClass('table').addClass('table-striped');
    var siteInput = $('#search input[name="site"]');
    if (siteInput.val().substring(0, 4) != "http") {
        siteInput.attr("value", window.location.hostname + siteInput.val());
    }
    jQuery("#search form").submit(function() {
        $('#search input[name="q"]').attr("value", $('#search input[name="searchQuery"]').val() + ' site:' + $('#search input[name="site"]').val());
    });
});
