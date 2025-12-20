package main

import (
	"github.com/jhead/lanscape/lanscaped/internal/daemon"
)

func main() {
	daemon.Run(daemon.LoadServerConfig())
}
