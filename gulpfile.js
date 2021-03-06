var gulp = require('gulp');

var concat = require('gulp-concat');
var uglify = require('gulp-uglify');
var sort = require('gulp-sort');
var iife = require("gulp-iife");
var Synci18n = require("sync-i18n");

var fs = require('fs');

gulp.task('i18n', function (done) {
  Synci18n({ destinationFile: './web/0_Translations.js' }).generateTranslations();
  done();
});

gulp.task('prepare-package', gulp.series('i18n', function() {
  return gulp.src("web/*.js")
    .pipe(sort())
    .pipe(concat('plugin.js'))
    .pipe(iife({useStrict: false, prependSemicolon: true}))
    .pipe(uglify())
    .pipe(gulp.dest('target/'));
}));

gulp.task('default', gulp.series('prepare-package'));
