{ pkgs }: {
  deps = [
    pkgs.python312
    pkgs.python312Packages.pip
    pkgs.nodejs_22
    pkgs.bash
    pkgs.gcc
  ];
}
