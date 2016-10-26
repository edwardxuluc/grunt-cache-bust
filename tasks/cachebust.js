'use strict';

var fs = require('fs-extra');
var url = require('url');
var path = require('path');
var crypto = require('crypto');
var _ = require('grunt').util._;

var DEFAULT_OPTIONS = {
    algorithm: 'md5',
    baseDir: './',
    createCopies: true,
    deleteOriginals: false,
    deleteOldHashFiles: false,
    encoding: 'utf8',
    jsonOutput: false,
    jsonOutputFilename: 'grunt-cache-bust.json',
    length: 16,
    separator: '.',
    queryString: false,
    outputDir: '',
    clearOutputDir: false
};

module.exports = function(grunt) {
    grunt.registerMultiTask('cacheBust', 'Bust static assets from the cache using content hashing', function() {
        var opts = this.options(DEFAULT_OPTIONS);

        var discoveryOpts = {
            cwd: path.resolve(opts.baseDir),
            filter: 'isFile'
        };

        //clear output dir if it was set
        if(opts.clearOutputDir && opts.outputDir.length > 0) {
            fs.removeSync(path.resolve((discoveryOpts.cwd ? discoveryOpts.cwd + opts.clearOutputDir : opts.clearOutputDir)));
        }

        // Generate an asset map
        var assetMap = grunt.file
            .expand(discoveryOpts, opts.assets)
            .sort()
            .reverse()
            .reduce(hashFile, {});

        // delete old hash files
        if(opts.deleteOldHashFiles) {
            var assetJSON = grunt.file.readJSON( path.resolve(opts.baseDir, opts.jsonOutputFilename) );

            _.each(assetJSON, function (hashed, original) {
                if( !_.contains(_.values(assetMap), hashed) && hashed !== original ){
                    fs.removeSync(path.resolve(opts.baseDir, hashed));
                }
            });
        }

        grunt.verbose.write('Assets found:', assetMap);

        // Write out assetMap
        if(opts.jsonOutput === true) {
            grunt.file.write(path.resolve(opts.baseDir, opts.jsonOutputFilename), JSON.stringify(assetMap));
        }

        // Go through each source file and replace terms
        getFilesToBeRenamed(this.files).forEach(replaceInFile);

        function escapeStr(s) {
            return String(s).replace(/[\\^$*+?.()|[\]{}]/g, '\\$&');
        }

        function replaceInFile(filepath) {
            var markup = grunt.file.read(filepath);

            _.each(assetMap, function(hashed, original) {

                // get file extension and the before file path
                var extOriginal = original.split('.').slice(-1),
                    trunkOriginal = original.split('.').slice(0, -1).join('.');

                var pattOrigFile = new RegExp(escapeStr(original) +"(\\?[a-fA-F0-9]+)?|("+ escapeStr(trunkOriginal+opts.separator) +"[a-fA-F0-9]+\\."+ extOriginal +")", "gm");

                markup = markup.replace(pattOrigFile, hashed);
            });

            grunt.file.write(filepath, markup);
        }

        function hashFile(obj, file) {
            var absPath = path.resolve(opts.baseDir, file);
            var hash = generateFileHash(grunt.file.read(absPath, {
                encoding: null
            }));
            var newFilename = addFileHash(file, hash, opts.separator);

            if (!opts.queryString) {
                if (opts.createCopies) {
                    grunt.file.copy(absPath, path.resolve(opts.baseDir, newFilename));
                }

                if (opts.deleteOriginals) {
                    grunt.file.delete(absPath, {force: true});
                }
            }

            obj[file] = newFilename;

            return obj;
        }

        function generateFileHash(data) {
            return opts.hash || crypto.createHash(opts.algorithm).update(data, opts.encoding).digest('hex').substring(0, opts.length);
        }

        function addFileHash(str, hash, separator) {
            if (opts.queryString) {
                return str + '?' + hash;
            } else {
                var parsed = url.parse(str);
                var pathToFile = opts.outputDir.length > 0 ? path.join(opts.outputDir, parsed.pathname.replace(/^.*[\\\/]/, '')) : parsed.pathname;
                var ext = path.extname(parsed.pathname);

                return (parsed.hostname ? parsed.protocol + parsed.hostname : '') + pathToFile.replace(ext, '') + (hash ? separator + hash : '') + ext;
            }
        }

        function getFilesToBeRenamed(files) {
            var originalConfig = files[0].orig;

            return grunt.file
                .expand(originalConfig, originalConfig.src)
                .map(function (file) {
                    grunt.log.ok('Busted:', file);
                    return path.resolve((originalConfig.cwd ? originalConfig.cwd + path.sep : '') + file);
                });
        }

    });

};
