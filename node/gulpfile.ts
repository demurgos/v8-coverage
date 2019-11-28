import gulp from "gulp";
import minimist from "minimist";
import NeonCrate from "neon-cli/lib/crate";
import NeonProject from "neon-cli/lib/project";
import path from "path";
import * as buildTools from "turbo-gulp";
import { Project } from "turbo-gulp/project";
import { DistOptions, LibTarget, LibTasks, registerLibTasks } from "turbo-gulp/targets/lib";
import { MochaTarget, MochaTasks, registerMochaTasks } from "turbo-gulp/targets/mocha";
import { npmPublish } from "turbo-gulp/utils/npm-publish";

interface Options {
  next?: string;
}

const options: Options & minimist.ParsedArgs = minimist(process.argv.slice(2), {
  string: ["next"],
  default: {next: undefined},
});

const project: Project = {
  root: __dirname,
  packageJson: "package.json",
  buildDir: "build",
  distDir: "dist",
  srcDir: "src",
  tslint: {
    configuration: {
      rules: {
        whitespace: false,
      },
    },
  },
};

const lib: LibTarget = {
  project,
  name: "lib",
  srcDir: "src/lib",
  scripts: ["**/*.ts"],
  mainModule: "index",
  dist: {
    packageJsonMap: (old: buildTools.PackageJson): buildTools.PackageJson => {
      const version: string = options.next !== undefined ? `${old.version}-build.${options.next}` : old.version;
      return <any> {...old, version, scripts: undefined, private: false};
    },
    npmPublish: {
      tag: options.devDist !== undefined ? "next" : "latest",
    },
  },
  tscOptions: {
    declaration: true,
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
  clean: {
    dirs: ["build/lib", "dist/lib"],
  },
};

const test: MochaTarget = {
  project,
  name: "test",
  srcDir: "src",
  scripts: ["test/**/*.ts", "lib/**/*.ts"],
  customTypingsDir: "src/custom-typings",
  tscOptions: {
    skipLibCheck: true,
  },
  clean: {
    dirs: ["build/test"],
  },
};

const libTasks: LibTasks = registerLibTasks(gulp, lib);
const testTasks: MochaTasks = registerMochaTasks(gulp, test);
buildTools.projectTasks.registerAll(gulp, project);

function generateNeonTask(nodeFile: string, release: boolean): gulp.TaskFunction {
  return async function buildNeon() {
    // Crate root (with Cargo.toml) relative to project root
    const crateRoot: string = ".";
    const neonProject: NeonProject = await NeonProject.create(project.root, {crate: crateRoot});
    const neonCrate: NeonCrate = new NeonCrate(neonProject, {subdirectory: crateRoot, nodefile: nodeFile});
    (neonProject as any).crate = neonCrate;
    return neonProject.build("stable", release);
  };
}

const libBuildNeon: gulp.TaskFunction = generateNeonTask("build/lib/native/index.node", true);
const libDistNeon: gulp.TaskFunction = generateNeonTask("dist/lib/native/index.node", true);
const testBuildNeon: gulp.TaskFunction = generateNeonTask("build/test/lib/native/index.node", true);
const testBuild: gulp.TaskFunction = gulp.parallel(testTasks.build, testBuildNeon);
const libDist: gulp.TaskFunction = gulp.parallel(libTasks.dist!, libDistNeon);
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
gulp.task("test", gulp.series(testTasks.clean!, testBuild, testTasks.coverageCjs!));

gulp.task("all:tsconfig.json", gulp.parallel("lib:tsconfig.json", "test:tsconfig.json"));
gulp.task("dist", libTasks.dist!);
gulp.task("default", libTasks.dist!);
