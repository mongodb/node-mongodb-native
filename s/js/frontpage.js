function initializeJS() {
  jQuery('.driverPicker').selectpicker();
  jQuery('.driverPicker').change(toggleDownload);
  jQuery('.releasePicker').selectpicker();
  jQuery('.releasePicker').change(toggleDownload);
  jQuery('.distroPicker').bootstrapToggle();
  jQuery('.distroPicker').change(toggleDownload);

  var clipboard = new ZeroClipboard(jQuery(".clipboard button"));
  var clipBridge = $('#global-zeroclipboard-html-bridge');
  clipBridge.tooltip({title: "copy to clipboard", placement: 'bottom'});
  clipboard.on( 'copy', function(event) {
    clipBridge.attr('title', 'copied').tooltip('fixTitle').tooltip('show');
    $('#global-zeroclipboard-html-bridge').tooltip({title: "copied", placement: 'bottom'});
    var button = jQuery(".clipboard button");
    button.addClass('btn-success');
    clipboard.clearData();
    prefix = $('.distroPicker').prop('checked') ? "#maven" : "#gradle"
    driverVersion = $('.driverPicker').selectpicker().val();
    releaseVersion = $('.releasePicker').selectpicker().val();
    activeSample = prefix + "-" + releaseVersion + "-" + driverVersion;
    clipboard.setText($(activeSample).text());

    button.animate({ opacity: 1 }, 400, function() {
      button.removeClass('btn-success');
      clipBridge.attr('title', 'copy to clipboard').tooltip('hide').tooltip('fixTitle');
    });
  });
};

var toggleDownload = function() {
  downloadLink = 'https://oss.sonatype.org/content/repositories/releases/org/mongodb/';
  downloadSnapshotLink = 'https://oss.sonatype.org/content/repositories/snapshots/org/mongodb/';
  prefix = $('.distroPicker').prop('checked') ? "#maven" : "#gradle";
  driverVersion = $('.driverPicker').selectpicker().val();
  releaseVersion = $('.releasePicker').selectpicker().val();
  activeDriver = $('.driverPicker option:selected').text();
  activeVersion = $('.releasePicker option:selected').text();

  driverVersions = $('.driverPicker option:selected').data('versions');
  $('.releasePicker option').each(function(){
    $(this).prop('disabled', driverVersions.indexOf($(this).text()) < 0);
  });

  $('.driverPicker option').each(function(){
    driverVersions = $(this).data('versions');
    $(this).prop('disabled', driverVersions.indexOf(activeVersion) < 0);
  });

  $('.driverPicker').selectpicker('refresh');
  $('.releasePicker').selectpicker('refresh');

  activeSample = prefix + "-" + releaseVersion + "-" + driverVersion;
  activeDescription = "#driver-" + driverVersion;

  if (activeVersion.indexOf("SNAPSHOT") > -1) {
    activeLink = downloadSnapshotLink + activeDriver +'/' + activeVersion + '/';
  } else {
    activeLink = downloadLink + activeDriver +'/' + activeVersion + '/';
  }

  $('.download').addClass('hidden');
  $(activeSample).removeClass('hidden');
  $(activeDescription).removeClass('hidden');
  $('#downloadLink').attr('href', activeLink);
};

jQuery(document).ready(function(){
  initializeJS();
  jQuery('[data-toggle="tooltip"]').tooltip();
  jQuery("body").addClass("hljsCode");
  hljs.initHighlightingOnLoad();
});
