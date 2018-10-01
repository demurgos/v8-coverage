import gulp from "gulp";
import minimist from "minimist";
import NeonCrate from "neon-cli/lib/crate";
import NeonProject from "neon-cli/lib/project";
import path from "path";
import * as buildTools from "turbo-gulp";
import { DistOptions } from "turbo-gulp/targets/lib";
import { npmPublish } from "turbo-gulp/utils/npm-publish";

interface Options {
  devDist?: string;
}

const options: Options & minimist.ParsedArgs = minimist(process.argv.slice(2), {
  string: ["devDist"],
  default: {devDist: undefined},
  alias: {devDist: "dev-dist"},
});

const project: buildTools.Project = {
  root: __dirname,
  packageJson: "package.json",
  buildDir: "build",
  distDir: "dist",
  srcDir: "src",
  typescript: {
    compilerOptions: {
      allowSyntheticDefaultImports: true,
      esModuleInterop: true,
    },
  },
  tslint: {
    configuration: {
      rules: {
        "no-submodule-import": false,
      },
    },
  },
};

const lib: buildTools.LibTarget = {
  project,
  name: "lib",
  srcDir: "src/lib",
  scripts: ["**/*.ts"],
  mainModule: "index",
  dist: {
    packageJsonMap: (old: buildTools.PackageJson): buildTools.PackageJson => {
      const version: string = options.devDist !== undefined ? `${old.version}-build.${options.devDist}` : old.version;
      return <any> {...old, version, scripts: undefined, private: false};
    },
    npmPublish: {
      tag: options.devDist !== undefined ? "next" : "latest",
    },
  },
  tscOptions: {
    skipLibCheck: true,
  },
  typedoc: {
    dir: "typedoc",
    name: "V8 Coverage (Node)",
    deploy: {
      repository: "git@github.com:demurgos/v8-coverage.git",
      branch: "gh-pages",
    },
  },
  copy: [
    {
      files: ["**/*.json"],
    },
  ],
  clean: {
    dirs: ["build/lib", "dist/lib"],
  },
};

const test: buildTools.MochaTarget = {
  project,
  name: "test",
  srcDir: "src",
  scripts: ["test/**/*.ts", "lib/**/*.ts"],
  customTypingsDir: "src/custom-typings",
  tscOptions: {
    skipLibCheck: true,
  },
  copy: [{files: ["test/scrapping/**/*.html"]}],
  clean: {
    dirs: ["build/test"],
  },
};

const libTasks: any = buildTools.registerLibTasks(gulp, lib);
const testTasks: any = buildTools.registerMochaTasks(gulp, test);
buildTools.projectTasks.registerAll(gulp, project);

function generateNeonTask(nodeFile: string, release: boolean): gulp.TaskFunction {
  return function buildNeon() {
    // Crate root (with Cargo.toml) relative to project root
    const crateRoot: string = ".";
    const neonProject: NeonProject = new NeonProject(project.root, {crate: crateRoot});
    const neonCrate: NeonCrate = new NeonCrate(neonProject, {subdirectory: crateRoot, nodefile: nodeFile});
    (neonProject as any).crate = neonCrate;
    return neonProject.build("stable", release);
  };
}

const libBuildNeon: gulp.TaskFunction = generateNeonTask("build/lib/native/index.node", true);
const libDistNeon: gulp.TaskFunction = generateNeonTask("dist/lib/native/index.node", true);
const testBuildNeon: gulp.TaskFunction = generateNeonTask("build/test/lib/native/index.node", false);
const testBuild: gulp.TaskFunction = gulp.parallel(testTasks.build, testBuildNeon);
const libDist: gulp.TaskFunction = gulp.parallel(libTasks.dist, libDistNeon);
const npmPublishTask: gulp.TaskFunction = async () => {
  return npmPublish({
    ...(lib.dist as DistOptions).npmPublish,
    directory: path.join(__dirname, "dist", "lib"),
  });
};

gulp.task("lib:build:neon", libBuildNeon);
gulp.task("lib:build", gulp.parallel(libTasks.build, libBuildNeon));
gulp.task("lib:dist", libDist);
gulp.task("lib:dist:publish", gulp.series(libDist, npmPublishTask));

gulp.task("test:build:neon", testBuildNeon);
gulp.task("test:build", testBuild);
gulp.task("test", gulp.series(testTasks.clean, testBuild, testTasks.coverage));

gulp.task("tsconfig.json", gulp.parallel("lib:tsconfig.json", "test:tsconfig.json"));
gulp.task("dist", libTasks.dist);
