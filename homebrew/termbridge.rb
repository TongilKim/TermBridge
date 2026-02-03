class Termbridge < Formula
  desc "Remote monitoring and control for Claude Code CLI"
  homepage "https://github.com/TongilKim/termbridge"
  url "https://registry.npmjs.org/@tongil_kim/termbridge/-/termbridge-0.1.2.tgz"
  sha256 "15d914c1d3d41690b78558bee954d9324ae5799598d8005f25a5ff20fcb13b1c"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    system "#{bin}/termbridge", "--version"
  end
end
