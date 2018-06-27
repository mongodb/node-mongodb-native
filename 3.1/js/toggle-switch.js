$(document).ready(function(){
  $('.distroPicker').bootstrapToggle();
  $('.distroPicker').change(function () {
    if ($('.distroPicker').prop('checked')) {
      $('.javascript6').addClass('hidden');
      $('.javascript5').removeClass('hidden');
    } else {
      $('.javascript5').addClass('hidden');
      $('.javascript6').removeClass('hidden');
    }
  });
});